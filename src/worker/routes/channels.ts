import { desc, eq, inArray } from 'drizzle-orm';
import { Hono } from 'hono';
import { getDb, type Database } from '../db/client';
import { notificationChannelMonitors, notificationChannels, notificationDeliveries, monitors } from '../db/schema';
import { requireAuth, type AuthVariables } from '../lib/require-auth';
import { dispatchTest } from '../notifications/dispatch';
import { CHANNEL_TYPES, maskChannelConfig, parseChannelConfig, type ChannelConfig, type ChannelType } from '../notifications/providers';
import { parseInteger } from './monitors';

type ParsedChannelInput = {
	name?: string;
	type?: ChannelType;
	config?: ChannelConfig;
	enabled?: boolean;
	notifyManual?: boolean;
	monitorIds?: number[];
};
type ParseResult = { ok: true; value: ParsedChannelInput } | { ok: false; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseId(raw: string) {
	const parsed = parseInteger(Number(raw), 'id', 1, Number.MAX_SAFE_INTEGER);
	return parsed.ok ? parsed.value : null;
}

function isChannelType(value: unknown): value is ChannelType {
	return typeof value === 'string' && CHANNEL_TYPES.some((type) => type === value);
}

export function parseChannelInput(body: unknown, partial = false, currentType?: ChannelType): ParseResult {
	if (!isRecord(body)) return { ok: false, message: 'Invalid request body' };
	const value: ParsedChannelInput = {};
	if (!partial || 'name' in body) {
		if (typeof body.name !== 'string' || body.name.trim().length < 1 || body.name.trim().length > 100) {
			return { ok: false, message: 'Name must be between 1 and 100 characters' };
		}
		value.name = body.name.trim();
	}
	if (!partial || 'type' in body) {
		if (!isChannelType(body.type)) return { ok: false, message: 'type must be slack, discord, telegram, or webhook' };
		value.type = body.type;
	}
	const effectiveType = value.type ?? currentType;
	if (!partial || 'config' in body || ('type' in body && body.type !== currentType)) {
		if (!effectiveType) return { ok: false, message: 'A channel type is required' };
		const config = parseChannelConfig(effectiveType, body.config);
		if (typeof config === 'string') return { ok: false, message: config };
		value.config = config;
	}
	for (const field of ['enabled', 'notifyManual'] as const) {
		if (!partial || field in body) {
			if (typeof body[field] !== 'boolean') return { ok: false, message: `${field} must be a boolean` };
			value[field] = body[field];
		}
	}
	if (!partial || 'monitorIds' in body) {
		if (!Array.isArray(body.monitorIds) || body.monitorIds.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
			return { ok: false, message: 'monitorIds must be an array of positive integers' };
		}
		value.monitorIds = [...new Set(body.monitorIds as number[])];
	}
	return { ok: true, value };
}

async function allMonitorsExist(db: Database, monitorIds: number[]) {
	if (monitorIds.length === 0) return true;
	const rows = await db.select({ id: monitors.id }).from(monitors).where(inArray(monitors.id, monitorIds));
	return rows.length === monitorIds.length;
}

function publicChannel(channel: typeof notificationChannels.$inferSelect, monitorIds: number[], lastDelivery: unknown) {
	const type = channel.type as ChannelType;
	let config: Record<string, unknown> = { configSet: false };
	if (isChannelType(type)) {
		try {
			const parsed = parseChannelConfig(type, JSON.parse(channel.config) as unknown);
			if (typeof parsed !== 'string') config = maskChannelConfig(type, parsed);
		} catch {
			config = { configSet: false };
		}
	}
	return { ...channel, type, config, monitorIds, lastDelivery };
}

const channelRoutes = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
channelRoutes.use('*', requireAuth);

channelRoutes.get('/', async (context) => {
	const db = getDb(context.env);
	const [channels, assignments] = await Promise.all([
		db.select().from(notificationChannels).orderBy(notificationChannels.createdAt),
		db.select().from(notificationChannelMonitors),
	]);
	const monitorIdsByChannel = new Map<number, number[]>();
	for (const assignment of assignments) {
		const ids = monitorIdsByChannel.get(assignment.channelId);
		if (ids) ids.push(assignment.monitorId);
		else monitorIdsByChannel.set(assignment.channelId, [assignment.monitorId]);
	}
	const lastDeliveries = await Promise.all(
		channels.map(async (channel) => {
			const [delivery] = await db
				.select()
				.from(notificationDeliveries)
				.where(eq(notificationDeliveries.channelId, channel.id))
				.orderBy(desc(notificationDeliveries.createdAt))
				.limit(1);
			return delivery ?? null;
		}),
	);
	return context.json({
		channels: channels.map((channel, index) => publicChannel(channel, monitorIdsByChannel.get(channel.id) ?? [], lastDeliveries[index])),
	});
});

channelRoutes.post('/', async (context) => {
	let body: unknown;
	try {
		body = await context.req.json();
	} catch {
		return context.json({ message: 'Invalid request body' }, 400);
	}
	const parsed = parseChannelInput(body);
	if (!parsed.ok) return context.json({ message: parsed.message }, 400);
	const db = getDb(context.env);
	const monitorIds = parsed.value.monitorIds!;
	if (!(await allMonitorsExist(db, monitorIds))) return context.json({ message: 'One or more monitors do not exist' }, 400);
	const now = new Date();
	const [channel] = await db
		.insert(notificationChannels)
		.values({
			name: parsed.value.name!,
			type: parsed.value.type!,
			config: JSON.stringify(parsed.value.config),
			enabled: parsed.value.enabled!,
			notifyManual: parsed.value.notifyManual!,
			createdAt: now,
			updatedAt: now,
		})
		.returning();
	if (monitorIds.length > 0) {
		await db.batch(
			monitorIds.map((monitorId) => db.insert(notificationChannelMonitors).values({ channelId: channel.id, monitorId })) as [
				ReturnType<typeof db.insert>,
				...ReturnType<typeof db.insert>[],
			],
		);
	}
	return context.json({ channel: publicChannel(channel, monitorIds, null) }, 201);
});

channelRoutes.patch('/:id', async (context) => {
	const id = parseId(context.req.param('id'));
	if (id === null) return context.json({ message: 'Notification channel not found' }, 404);
	const db = getDb(context.env);
	const [existing] = await db.select().from(notificationChannels).where(eq(notificationChannels.id, id)).limit(1);
	if (!existing || !isChannelType(existing.type)) return context.json({ message: 'Notification channel not found' }, 404);
	let body: unknown;
	try {
		body = await context.req.json();
	} catch {
		return context.json({ message: 'Invalid request body' }, 400);
	}
	const parsed = parseChannelInput(body, true, existing.type);
	if (!parsed.ok) return context.json({ message: parsed.message }, 400);
	if (Object.keys(parsed.value).length === 0) return context.json({ message: 'Provide at least one field to update' }, 400);
	if (parsed.value.monitorIds && !(await allMonitorsExist(db, parsed.value.monitorIds))) {
		return context.json({ message: 'One or more monitors do not exist' }, 400);
	}
	const { monitorIds, config, ...changes } = parsed.value;
	const statements: Parameters<Database['batch']>[0][number][] = [
		db
			.update(notificationChannels)
			.set({ ...changes, ...(config ? { config: JSON.stringify(config) } : {}), updatedAt: new Date() })
			.where(eq(notificationChannels.id, id)),
	];
	if (monitorIds) {
		statements.push(db.delete(notificationChannelMonitors).where(eq(notificationChannelMonitors.channelId, id)));
		statements.push(...monitorIds.map((monitorId) => db.insert(notificationChannelMonitors).values({ channelId: id, monitorId })));
	}
	await db.batch(statements as [(typeof statements)[number], ...typeof statements]);
	const [channel] = await db.select().from(notificationChannels).where(eq(notificationChannels.id, id)).limit(1);
	const assignments = await db
		.select({ monitorId: notificationChannelMonitors.monitorId })
		.from(notificationChannelMonitors)
		.where(eq(notificationChannelMonitors.channelId, id));
	return context.json({
		channel: publicChannel(
			channel,
			assignments.map((row) => row.monitorId),
			null,
		),
	});
});

channelRoutes.delete('/:id', async (context) => {
	const id = parseId(context.req.param('id'));
	if (id === null) return context.json({ message: 'Notification channel not found' }, 404);
	const db = getDb(context.env);
	const [channel] = await db
		.select({ id: notificationChannels.id })
		.from(notificationChannels)
		.where(eq(notificationChannels.id, id))
		.limit(1);
	if (!channel) return context.json({ message: 'Notification channel not found' }, 404);
	await db.batch([
		db.delete(notificationChannelMonitors).where(eq(notificationChannelMonitors.channelId, id)),
		db.delete(notificationDeliveries).where(eq(notificationDeliveries.channelId, id)),
		db.delete(notificationChannels).where(eq(notificationChannels.id, id)),
	]);
	return context.json({ ok: true });
});

channelRoutes.post('/:id/test', async (context) => {
	const id = parseId(context.req.param('id'));
	if (id === null) return context.json({ message: 'Notification channel not found' }, 404);
	const result = await dispatchTest(context.env, id);
	if (!result.ok)
		return context.json(
			{ message: result.error ?? 'Notification delivery failed' },
			result.error === 'Notification channel not found' ? 404 : 502,
		);
	return context.json({ ok: true });
});

channelRoutes.get('/:id/deliveries', async (context) => {
	const id = parseId(context.req.param('id'));
	if (id === null) return context.json({ message: 'Notification channel not found' }, 404);
	const rawLimit = Number(context.req.query('limit') ?? 20);
	const limit = Number.isSafeInteger(rawLimit) ? Math.min(100, Math.max(1, rawLimit)) : 20;
	const db = getDb(context.env);
	const [channel] = await db
		.select({ id: notificationChannels.id })
		.from(notificationChannels)
		.where(eq(notificationChannels.id, id))
		.limit(1);
	if (!channel) return context.json({ message: 'Notification channel not found' }, 404);
	const deliveries = await db
		.select()
		.from(notificationDeliveries)
		.where(eq(notificationDeliveries.channelId, id))
		.orderBy(desc(notificationDeliveries.createdAt))
		.limit(limit);
	return context.json({ deliveries });
});

export default channelRoutes;
