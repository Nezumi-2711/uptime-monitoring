import { and, eq, inArray } from 'drizzle-orm';
import { findLatestAutoIncidentForMonitor } from '../autopilot/signal';
import { getDb } from '../db/client';
import { incidentMonitors, notificationChannelMonitors, notificationChannels, notificationDeliveries } from '../db/schema';
import {
	CHANNEL_TYPES,
	formatChannel,
	parseChannelConfig,
	type ChannelType,
	type NotificationEvent,
	type OutboundRequest,
} from './providers';

export const MAX_NOTIFICATIONS_PER_RUN = 40;
export type NotificationBudget = { remaining: number };

type DeliveryResult = { ok: boolean; statusCode: number | null; error: string | null; attempts: number };
type RunNotification = { event: NotificationEvent; monitorAlertsEnabled: boolean };

function isChannelType(value: string): value is ChannelType {
	return CHANNEL_TYPES.some((type) => type === value);
}

async function sendRequest(request: OutboundRequest): Promise<DeliveryResult> {
	let attempts = 0;
	for (;;) {
		attempts += 1;
		try {
			const response = await fetch(request.url, { method: 'POST', headers: request.headers, body: request.body });
			await response.body?.cancel();
			if (response.ok) return { ok: true, statusCode: response.status, error: null, attempts };
			const retryable = response.status === 429 || response.status >= 500;
			if (!retryable || attempts >= 2) {
				return { ok: false, statusCode: response.status, error: `HTTP ${response.status}`, attempts };
			}
		} catch (error) {
			if (attempts >= 2) {
				return {
					ok: false,
					statusCode: null,
					error: error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500),
					attempts,
				};
			}
		}
		await new Promise((resolve) => setTimeout(resolve, 500));
	}
}

async function persistDeliveries(env: Env, event: NotificationEvent, results: Array<{ channelId: number; result: DeliveryResult }>) {
	if (results.length === 0) return;
	const db = getDb(env);
	const createdAt = new Date();
	const statements = results.map(({ channelId, result }) =>
		db.insert(notificationDeliveries).values({
			channelId,
			incidentId: event.incidentId,
			monitorId: event.monitor?.id ?? null,
			event: event.kind,
			ok: result.ok,
			statusCode: result.statusCode,
			error: result.error,
			attempts: result.attempts,
			createdAt,
		}),
	);
	await db.batch(statements as [(typeof statements)[number], ...typeof statements]);
}

async function persistRunDeliveries(
	env: Env,
	rows: Array<{ event: NotificationEvent; channelId: number; result: DeliveryResult }>,
): Promise<void> {
	if (rows.length === 0) return;
	const createdAt = Date.now();
	await env.DB.prepare(
		`INSERT INTO notification_deliveries
		 (channel_id, incident_id, monitor_id, event, ok, status_code, error, attempts, created_at)
		 SELECT json_extract(value, '$.channelId'), json_extract(value, '$.incidentId'), json_extract(value, '$.monitorId'),
		        json_extract(value, '$.event'), json_extract(value, '$.ok'), json_extract(value, '$.statusCode'),
		        json_extract(value, '$.error'), json_extract(value, '$.attempts'), ?2
		 FROM json_each(?1)`,
	)
		.bind(
			JSON.stringify(
				rows.map(({ event, channelId, result }) => ({
					channelId,
					incidentId: event.incidentId,
					monitorId: event.monitor?.id ?? null,
					event: event.kind,
					ok: result.ok ? 1 : 0,
					statusCode: result.statusCode,
					error: result.error,
					attempts: result.attempts,
				})),
			),
			createdAt,
		)
		.run();
}

function invalidDelivery(error: unknown): DeliveryResult {
	return {
		ok: false,
		statusCode: null,
		error: error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500),
		attempts: 0,
	};
}

/** Routes all scheduled-run events from one channel snapshot and persists deliveries once. */
export async function dispatchRunNotifications(env: Env, inputs: RunNotification[], budget: NotificationBudget): Promise<void> {
	const events = inputs.filter((input) => input.monitorAlertsEnabled && input.event.monitor);
	if (events.length === 0) return;
	const db = getDb(env);
	const channels = await db.select().from(notificationChannels).where(eq(notificationChannels.enabled, true));
	if (channels.length === 0) return;
	const assignments = await db
		.select()
		.from(notificationChannelMonitors)
		.where(
			inArray(
				notificationChannelMonitors.channelId,
				channels.map((channel) => channel.id),
			),
		);
	const monitorIdsByChannel = new Map<number, Set<number>>();
	for (const assignment of assignments) {
		let monitorIds = monitorIdsByChannel.get(assignment.channelId);
		if (!monitorIds) {
			monitorIds = new Set<number>();
			monitorIdsByChannel.set(assignment.channelId, monitorIds);
		}
		monitorIds.add(assignment.monitorId);
	}

	const downEvents = events.filter(({ event }) => event.kind === 'down' || event.kind === 'recovered');
	const incidentByMonitorAndState = new Map<string, number>();
	if (downEvents.length > 0) {
		const monitorIds = [...new Set(downEvents.map(({ event }) => event.monitor!.id))];
		const incidents = await env.DB.prepare(
			`SELECT im.monitor_id, i.id, CASE WHEN i.resolved_at IS NULL THEN 0 ELSE 1 END AS resolved
			 FROM incident_monitors im JOIN incidents i ON i.id = im.incident_id
			 JOIN json_each(?1) targets ON im.monitor_id = targets.value
			 WHERE i.source = 'auto' AND i.kind = 'down'
			 ORDER BY i.started_at DESC`,
		)
			.bind(JSON.stringify(monitorIds))
			.all<{ monitor_id: number; id: number; resolved: number }>();
		for (const incident of incidents.results) {
			const key = `${incident.monitor_id}:${incident.resolved}`;
			if (!incidentByMonitorAndState.has(key)) incidentByMonitorAndState.set(key, incident.id);
		}
	}

	const work: Array<{ event: NotificationEvent; channel: (typeof channels)[number] }> = [];
	for (const { event } of events) {
		const effectiveEvent =
			event.monitor && (event.kind === 'down' || event.kind === 'recovered')
				? {
						...event,
						incidentId: incidentByMonitorAndState.get(`${event.monitor.id}:${event.kind === 'recovered' ? 1 : 0}`) ?? null,
					}
				: event;
		for (const channel of channels) {
			const monitorIds = monitorIdsByChannel.get(channel.id);
			if (!monitorIds || monitorIds.size === 0 || monitorIds.has(event.monitor!.id)) work.push({ event: effectiveEvent, channel });
		}
	}

	const available = Math.max(0, budget.remaining);
	const sendable = work.slice(0, available);
	budget.remaining -= sendable.length;
	const skipped = work.slice(sendable.length).map(({ event, channel }) => ({
		event,
		channelId: channel.id,
		result: { ok: false, statusCode: null, error: 'skipped: per-run limit', attempts: 0 } satisfies DeliveryResult,
	}));
	const settled = await Promise.allSettled(
		sendable.map(async ({ event, channel }) => {
			if (!isChannelType(channel.type)) throw new Error(`Unsupported channel type: ${channel.type}`);
			let rawConfig: unknown;
			try {
				rawConfig = JSON.parse(channel.config);
			} catch {
				throw new Error('Invalid stored channel configuration');
			}
			const config = parseChannelConfig(channel.type, rawConfig);
			if (typeof config === 'string') throw new Error(config);
			return { event, channelId: channel.id, result: await sendRequest(formatChannel(channel.type, config, event)) };
		}),
	);
	const delivered = settled.map((result, index) =>
		result.status === 'fulfilled'
			? result.value
			: { event: sendable[index].event, channelId: sendable[index].channel.id, result: invalidDelivery(result.reason) },
	);
	await persistRunDeliveries(env, [...delivered, ...skipped]);
}

export async function dispatchNotification(env: Env, event: NotificationEvent, budget?: NotificationBudget): Promise<void> {
	const db = getDb(env);
	let effectiveEvent = event;
	if (event.incidentId === null && event.monitor && (event.kind === 'down' || event.kind === 'recovered')) {
		const incident = await findLatestAutoIncidentForMonitor(db, event.monitor.id, {
			resolved: event.kind === 'recovered',
			kind: 'down',
		});
		if (incident) effectiveEvent = { ...event, incidentId: incident.id };
	}
	let targetMonitorIds = event.monitor ? [event.monitor.id] : [];
	if (!event.monitor && event.incidentId !== null) {
		const rows = await db
			.select({ monitorId: incidentMonitors.monitorId })
			.from(incidentMonitors)
			.where(eq(incidentMonitors.incidentId, event.incidentId));
		targetMonitorIds = rows.map((row) => row.monitorId);
	}
	if (event.monitor) {
		const monitor = await env.DB.prepare('SELECT alerts_enabled FROM monitors WHERE id = ?').bind(event.monitor.id).first<{
			alerts_enabled: number;
		}>();
		if (!monitor || monitor.alerts_enabled !== 1) return;
	}

	const channels = await db
		.select()
		.from(notificationChannels)
		.where(
			event.kind === 'manual_opened' || event.kind === 'manual_update'
				? and(eq(notificationChannels.enabled, true), eq(notificationChannels.notifyManual, true))
				: eq(notificationChannels.enabled, true),
		);
	if (channels.length === 0) return;

	const assignments = await db
		.select()
		.from(notificationChannelMonitors)
		.where(
			inArray(
				notificationChannelMonitors.channelId,
				channels.map((channel) => channel.id),
			),
		);
	const monitorIdsByChannel = new Map<number, number[]>();
	for (const assignment of assignments) {
		const ids = monitorIdsByChannel.get(assignment.channelId);
		if (ids) ids.push(assignment.monitorId);
		else monitorIdsByChannel.set(assignment.channelId, [assignment.monitorId]);
	}
	const routed = channels.filter((channel) => {
		const monitorIds = monitorIdsByChannel.get(channel.id) ?? [];
		return monitorIds.length === 0 || monitorIds.some((monitorId) => targetMonitorIds.includes(monitorId));
	});

	const available = Math.max(0, budget?.remaining ?? MAX_NOTIFICATIONS_PER_RUN);
	const sendable = routed.slice(0, available);
	if (budget) budget.remaining -= sendable.length;
	const skipped = routed.slice(sendable.length).map((channel) => ({
		channelId: channel.id,
		result: { ok: false, statusCode: null, error: 'skipped: per-run limit', attempts: 0 },
	}));

	const settled = await Promise.allSettled(
		sendable.map(async (channel) => {
			if (!isChannelType(channel.type)) throw new Error(`Unsupported channel type: ${channel.type}`);
			let rawConfig: unknown;
			try {
				rawConfig = JSON.parse(channel.config);
			} catch {
				throw new Error('Invalid stored channel configuration');
			}
			const config = parseChannelConfig(channel.type, rawConfig);
			if (typeof config === 'string') throw new Error(config);
			return { channelId: channel.id, result: await sendRequest(formatChannel(channel.type, config, effectiveEvent)) };
		}),
	);
	const delivered = settled.map((result, index) =>
		result.status === 'fulfilled'
			? result.value
			: {
					channelId: sendable[index].id,
					result: {
						ok: false,
						statusCode: null,
						error: result.reason instanceof Error ? result.reason.message.slice(0, 500) : String(result.reason).slice(0, 500),
						attempts: 0,
					},
				},
	);
	await persistDeliveries(env, effectiveEvent, [...delivered, ...skipped]);
}

export async function dispatchTest(env: Env, channelId: number): Promise<{ ok: boolean; error: string | null }> {
	const db = getDb(env);
	const [channel] = await db.select().from(notificationChannels).where(eq(notificationChannels.id, channelId)).limit(1);
	if (!channel) return { ok: false, error: 'Notification channel not found' };
	const event: NotificationEvent = {
		kind: 'test',
		monitor: null,
		incidentId: null,
		title: 'Upwatch test',
		body: 'Your notification channel is configured correctly.',
		statusCode: 200,
		error: null,
		at: new Date(),
	};
	let result: DeliveryResult;
	try {
		if (!isChannelType(channel.type)) throw new Error(`Unsupported channel type: ${channel.type}`);
		const config = parseChannelConfig(channel.type, JSON.parse(channel.config) as unknown);
		if (typeof config === 'string') throw new Error(config);
		result = await sendRequest(formatChannel(channel.type, config, event));
	} catch (error) {
		result = { ok: false, statusCode: null, error: error instanceof Error ? error.message : String(error), attempts: 0 };
	}
	await persistDeliveries(env, event, [{ channelId, result }]);
	return { ok: result.ok, error: result.error };
}
