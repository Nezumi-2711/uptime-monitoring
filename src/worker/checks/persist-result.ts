import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { Database } from '../db/client';
import { checks, incidentMonitors, incidents, incidentUpdates, monitors } from '../db/schema';
import { DEGRADED_RECOVERY_UPDATE_BODY, DEGRADED_SUPERSEDED_UPDATE_BODY, RECOVERY_UPDATE_BODY } from '../ai/fallback-message';
import type { CheckResult, Monitor } from './run-check';

/** Only opened and resolved transitions are allowed to send alerts. */
export type CheckTransition = 'opened' | 'pending' | 'cleared' | 'resolved' | null;
export type AlertTransition = Extract<CheckTransition, 'opened' | 'resolved'>;
export type LatencyTransition = 'degraded' | 'recovered' | null;

type BatchStatement = Parameters<Database['batch']>[0][number];
type ResultState = {
	transition: CheckTransition;
	latencyTransition: LatencyTransition;
	consecutiveFailures: number;
	monitorUpdate: {
		id: number;
		lastOk?: boolean;
		consecutiveFailures: number;
		consecutiveSlow: number;
		lastDegraded: boolean;
		lastStatusCode: number | null;
		lastLatencyMs: number;
		lastError: string | null;
		lastCheckedAt: number;
		updatedAt: number;
	};
};

export type ScheduledResult = {
	monitor: Monitor;
	result: CheckResult;
	checkedAt: Date;
	maintenance: boolean;
	transition: CheckTransition;
	latencyTransition: LatencyTransition;
	consecutiveFailures: number;
};

function computeResultState(monitor: Monitor, result: CheckResult, checkedAt: Date, maintenance: boolean): ResultState {
	const baseUpdate = {
		id: monitor.id,
		consecutiveFailures: monitor.consecutiveFailures,
		consecutiveSlow: monitor.consecutiveSlow,
		lastDegraded: monitor.lastDegraded,
		lastStatusCode: result.statusCode,
		lastLatencyMs: result.latencyMs,
		lastError: result.error,
		lastCheckedAt: checkedAt.getTime(),
		updatedAt: checkedAt.getTime(),
	};
	if (maintenance) {
		return {
			transition: null,
			latencyTransition: null,
			consecutiveFailures: monitor.consecutiveFailures,
			monitorUpdate: baseUpdate,
		};
	}

	const threshold = Math.max(1, monitor.failureThreshold);
	const previousFailures = monitor.consecutiveFailures;
	const nextFailures = result.ok ? 0 : previousFailures + 1;
	const nextSlow = result.degraded ? monitor.consecutiveSlow + 1 : 0;
	const wasDown = monitor.lastOk === false;
	const isDown = !result.ok && nextFailures >= threshold;
	const confirmed = result.ok ? true : isDown ? false : undefined;
	const confirmedDegraded = nextSlow >= threshold;
	const latencyTransition: LatencyTransition =
		!monitor.lastDegraded && confirmedDegraded ? 'degraded' : monitor.lastDegraded && !confirmedDegraded ? 'recovered' : null;
	const transition: CheckTransition =
		!wasDown && isDown ? 'opened' : wasDown && result.ok ? 'resolved' : !result.ok ? 'pending' : previousFailures > 0 ? 'cleared' : null;

	return {
		transition,
		latencyTransition,
		consecutiveFailures: nextFailures,
		monitorUpdate: {
			...baseUpdate,
			...(confirmed === undefined ? {} : { lastOk: confirmed }),
			consecutiveFailures: nextFailures,
			consecutiveSlow: nextSlow,
			lastDegraded: confirmedDegraded,
		},
	};
}

export function buildResultStatements(
	db: Database,
	monitor: Monitor,
	result: CheckResult,
	checkedAt: Date,
	maintenance = false,
	options: { degradedIncidents?: boolean } = {},
) {
	const state = computeResultState(monitor, result, checkedAt, maintenance);
	const statements: BatchStatement[] = [
		db.insert(checks).values({
			monitorId: monitor.id,
			ok: result.ok,
			degraded: result.degraded,
			statusCode: result.statusCode,
			latencyMs: result.latencyMs,
			error: result.error,
			checkedAt,
			maintenance,
		}),
	];

	if (maintenance) {
		statements.push(
			db
				.update(monitors)
				.set({
					lastStatusCode: result.statusCode,
					lastLatencyMs: result.latencyMs,
					lastError: result.error,
					lastCheckedAt: checkedAt,
					updatedAt: checkedAt,
				})
				.where(eq(monitors.id, monitor.id)),
		);
		return {
			statements,
			transition: state.transition,
			latencyTransition: state.latencyTransition,
			consecutiveFailures: state.consecutiveFailures,
		};
	}

	const threshold = Math.max(1, monitor.failureThreshold);
	// This deliberately uses the monitor snapshot. Concurrent manual and scheduled checks may lose one increment,
	// which delays confirmation by one check but cannot publish a false incident.
	const nextFailures = state.monitorUpdate.consecutiveFailures;
	const nextSlow = state.monitorUpdate.consecutiveSlow;
	const wasDown = monitor.lastOk === false;
	const isDown = !result.ok && nextFailures >= threshold;
	const confirmed = state.monitorUpdate.lastOk;
	const confirmedDegraded = state.monitorUpdate.lastDegraded;
	const latencyTransition = state.latencyTransition;

	statements.push(
		db
			.update(monitors)
			.set({
				...(confirmed === undefined ? {} : { lastOk: confirmed }),
				consecutiveFailures: nextFailures,
				consecutiveSlow: nextSlow,
				lastDegraded: confirmedDegraded,
				lastStatusCode: result.statusCode,
				lastLatencyMs: result.latencyMs,
				lastError: result.error,
				lastCheckedAt: checkedAt,
				updatedAt: checkedAt,
			})
			.where(eq(monitors.id, monitor.id)),
	);

	let transition: CheckTransition = null;
	if (!wasDown && isDown) {
		const localImpact =
			result.statusCode === null || (result.statusCode !== null && result.statusCode >= 500) || nextFailures >= 10 ? 'major' : 'minor';
		statements.push(
			db.insert(incidents).values({
				status: 'investigating',
				impact: localImpact,
				source: 'auto',
				kind: 'down',
				startedAt: checkedAt,
				startStatusCode: result.statusCode,
				startError: result.error,
				createdAt: checkedAt,
				updatedAt: checkedAt,
			}),
			db.insert(incidentMonitors).values({ incidentId: sql`last_insert_rowid()`, monitorId: monitor.id }),
		);
		// Keep this after incident_monitors: that statement must consume the new down incident rowid first.
		if (options.degradedIncidents) {
			const degradedIds = db
				.select({ id: incidentMonitors.incidentId })
				.from(incidentMonitors)
				.innerJoin(incidents, eq(incidents.id, incidentMonitors.incidentId))
				.where(
					and(
						eq(incidentMonitors.monitorId, monitor.id),
						eq(incidents.source, 'auto'),
						eq(incidents.kind, 'degraded'),
						isNull(incidents.resolvedAt),
					),
				);
			statements.push(
				db.insert(incidentUpdates).select(
					db
						.select({
							id: sql<number | null>`null`.as('id'),
							incidentId: incidents.id,
							status: sql<string>`'resolved'`.as('status'),
							body: sql<string>`${DEGRADED_SUPERSEDED_UPDATE_BODY}`.as('body'),
							note: sql<string | null>`null`.as('note'),
							source: sql<string>`'system'`.as('source'),
							createdAt: sql<Date>`${checkedAt.getTime()}`.as('created_at'),
						})
						.from(incidents)
						.where(inArray(incidents.id, degradedIds)),
				),
				db
					.update(incidents)
					.set({
						status: 'resolved',
						resolvedAt: checkedAt,
						durationMs: sql`${checkedAt.getTime()} - ${incidents.startedAt}`,
						updatedAt: checkedAt,
					})
					.where(inArray(incidents.id, degradedIds)),
			);
		}
		transition = 'opened';
	} else if (wasDown && result.ok) {
		const openIncidentIds = db
			.select({ id: incidentMonitors.incidentId })
			.from(incidentMonitors)
			.innerJoin(incidents, eq(incidents.id, incidentMonitors.incidentId))
			.where(
				and(
					eq(incidentMonitors.monitorId, monitor.id),
					eq(incidents.source, 'auto'),
					eq(incidents.kind, 'down'),
					isNull(incidents.resolvedAt),
				),
			);
		statements.push(
			db.insert(incidentUpdates).select(
				db
					.select({
						id: sql<number | null>`null`.as('id'),
						incidentId: incidents.id,
						status: sql<string>`'resolved'`.as('status'),
						body: sql<string>`${RECOVERY_UPDATE_BODY}`.as('body'),
						note: sql<string | null>`null`.as('note'),
						source: sql<string>`'system'`.as('source'),
						createdAt: sql<Date>`${checkedAt.getTime()}`.as('created_at'),
					})
					.from(incidents)
					.where(
						and(
							eq(incidents.source, 'auto'),
							eq(incidents.kind, 'down'),
							isNull(incidents.resolvedAt),
							inArray(incidents.id, openIncidentIds),
						),
					),
			),
			db
				.update(incidents)
				.set({
					status: 'resolved',
					resolvedAt: checkedAt,
					durationMs: sql`${checkedAt.getTime()} - ${incidents.startedAt}`,
					updatedAt: checkedAt,
				})
				.where(
					and(
						eq(incidents.source, 'auto'),
						eq(incidents.kind, 'down'),
						isNull(incidents.resolvedAt),
						inArray(incidents.id, openIncidentIds),
					),
				),
		);
		transition = 'resolved';
	} else if (!wasDown && !result.ok) transition = 'pending';
	else if (!wasDown && result.ok && monitor.consecutiveFailures > 0) transition = 'cleared';

	if (options.degradedIncidents && monitor.alertsEnabled && latencyTransition === 'degraded' && !isDown) {
		statements.push(
			db.insert(incidents).values({
				status: 'investigating',
				impact: 'minor',
				source: 'auto',
				kind: 'degraded',
				startedAt: checkedAt,
				startStatusCode: result.statusCode,
				startError: result.error,
				createdAt: checkedAt,
				updatedAt: checkedAt,
			}),
			db.insert(incidentMonitors).values({ incidentId: sql`last_insert_rowid()`, monitorId: monitor.id }),
		);
	} else if (options.degradedIncidents && latencyTransition === 'recovered') {
		const degradedIds = db
			.select({ id: incidentMonitors.incidentId })
			.from(incidentMonitors)
			.innerJoin(incidents, eq(incidents.id, incidentMonitors.incidentId))
			.where(
				and(
					eq(incidentMonitors.monitorId, monitor.id),
					eq(incidents.source, 'auto'),
					eq(incidents.kind, 'degraded'),
					isNull(incidents.resolvedAt),
				),
			);
		statements.push(
			db.insert(incidentUpdates).select(
				db
					.select({
						id: sql<number | null>`null`.as('id'),
						incidentId: incidents.id,
						status: sql<string>`'resolved'`.as('status'),
						body: sql<string>`${DEGRADED_RECOVERY_UPDATE_BODY}`.as('body'),
						note: sql<string | null>`null`.as('note'),
						source: sql<string>`'system'`.as('source'),
						createdAt: sql<Date>`${checkedAt.getTime()}`.as('created_at'),
					})
					.from(incidents)
					.where(inArray(incidents.id, degradedIds)),
			),
			db
				.update(incidents)
				.set({
					status: 'resolved',
					resolvedAt: checkedAt,
					durationMs: sql`${checkedAt.getTime()} - ${incidents.startedAt}`,
					updatedAt: checkedAt,
				})
				.where(inArray(incidents.id, degradedIds)),
		);
	}

	return { statements, transition, latencyTransition, consecutiveFailures: nextFailures };
}

/**
 * Persists an entire scheduled run with a fixed number of D1 statements. The incident statements
 * are only added for transitions that occurred, so a healthy 40-monitor run uses two statements.
 */
export async function persistScheduledResults(
	env: Env,
	items: Array<Pick<ScheduledResult, 'monitor' | 'result' | 'checkedAt' | 'maintenance'>>,
	options: { degradedIncidents?: boolean } = {},
): Promise<ScheduledResult[]> {
	if (items.length === 0) return [];
	const persisted = items.map((item) => ({ ...item, ...computeResultState(item.monitor, item.result, item.checkedAt, item.maintenance) }));
	const checksJson = JSON.stringify(
		persisted.map(({ monitor, result, checkedAt, maintenance }) => ({
			monitorId: monitor.id,
			ok: result.ok ? 1 : 0,
			degraded: result.degraded ? 1 : 0,
			statusCode: result.statusCode,
			latencyMs: result.latencyMs,
			error: result.error,
			checkedAt: checkedAt.getTime(),
			maintenance: maintenance ? 1 : 0,
		})),
	);
	const updatesJson = JSON.stringify(
		persisted.map(({ monitorUpdate }) => ({
			...monitorUpdate,
			lastOk: 'lastOk' in monitorUpdate ? (monitorUpdate.lastOk ? 1 : 0) : null,
			hasLastOk: 'lastOk' in monitorUpdate ? 1 : 0,
			lastDegraded: monitorUpdate.lastDegraded ? 1 : 0,
		})),
	);
	const statements: D1PreparedStatement[] = [
		env.DB.prepare(
			`INSERT INTO checks (monitor_id, ok, degraded, status_code, latency_ms, error, checked_at, maintenance)
			 SELECT json_extract(value, '$.monitorId'), json_extract(value, '$.ok'), json_extract(value, '$.degraded'),
			        json_extract(value, '$.statusCode'), json_extract(value, '$.latencyMs'), json_extract(value, '$.error'),
			        json_extract(value, '$.checkedAt'), json_extract(value, '$.maintenance')
			 FROM json_each(?1)`,
		).bind(checksJson),
		env.DB.prepare(
			`UPDATE monitors SET
			 last_ok = CASE WHEN json_extract(v.value, '$.hasLastOk') = 1 THEN json_extract(v.value, '$.lastOk') ELSE monitors.last_ok END,
			 consecutive_failures = json_extract(v.value, '$.consecutiveFailures'),
			 consecutive_slow = json_extract(v.value, '$.consecutiveSlow'),
			 last_degraded = json_extract(v.value, '$.lastDegraded'),
			 last_status_code = json_extract(v.value, '$.lastStatusCode'),
			 last_latency_ms = json_extract(v.value, '$.lastLatencyMs'),
			 last_error = json_extract(v.value, '$.lastError'),
			 last_checked_at = json_extract(v.value, '$.lastCheckedAt'),
			 updated_at = json_extract(v.value, '$.updatedAt')
			 FROM json_each(?1) AS v WHERE monitors.id = json_extract(v.value, '$.id')`,
		).bind(updatesJson),
	];

	const appendOpenedIncidents = (kind: 'down' | 'degraded', opened: typeof persisted) => {
		if (opened.length === 0) return;
		const rows = JSON.stringify(
			opened.map(({ monitor, result, checkedAt, consecutiveFailures }) => ({
				monitorId: monitor.id,
				impact:
					kind === 'degraded'
						? 'minor'
						: result.statusCode === null || result.statusCode >= 500 || consecutiveFailures >= 10
							? 'major'
							: 'minor',
				startedAt: checkedAt.getTime(),
				statusCode: result.statusCode,
				error: result.error,
			})),
		);
		statements.push(
			env.DB.prepare(
				`INSERT INTO incidents (status, impact, source, kind, started_at, start_status_code, start_error, created_at, updated_at)
				 SELECT 'investigating', json_extract(value, '$.impact'), 'auto', ?2, json_extract(value, '$.startedAt'),
				        json_extract(value, '$.statusCode'), json_extract(value, '$.error'), json_extract(value, '$.startedAt'), json_extract(value, '$.startedAt')
				 FROM json_each(?1) ORDER BY CAST(key AS INTEGER)`,
			).bind(rows, kind),
			env.DB.prepare(
				`WITH inserted(last_id) AS MATERIALIZED (SELECT last_insert_rowid())
				 INSERT INTO incident_monitors (incident_id, monitor_id)
				 SELECT inserted.last_id - json_array_length(?1) + 1 + CAST(j.key AS INTEGER),
				        json_extract(j.value, '$.monitorId')
				 FROM json_each(?1) j CROSS JOIN inserted`,
			).bind(rows),
		);
	};

	const openedDown = persisted.filter((item) => !item.maintenance && item.transition === 'opened');
	appendOpenedIncidents('down', openedDown);
	if (options.degradedIncidents) {
		appendOpenedIncidents(
			'degraded',
			persisted.filter(
				(item) => !item.maintenance && item.monitor.alertsEnabled && item.latencyTransition === 'degraded' && item.transition !== 'opened',
			),
		);
	}

	const appendResolution = (kind: 'down' | 'degraded', resolved: typeof persisted, body: string) => {
		if (resolved.length === 0) return;
		const rows = JSON.stringify(resolved.map(({ monitor, checkedAt }) => ({ monitorId: monitor.id, checkedAt: checkedAt.getTime() })));
		statements.push(
			env.DB.prepare(
				`INSERT INTO incident_updates (incident_id, status, body, source, created_at)
				 SELECT i.id, 'resolved', ?2, 'system', json_extract(j.value, '$.checkedAt')
				 FROM json_each(?1) j JOIN incident_monitors im ON im.monitor_id = json_extract(j.value, '$.monitorId')
				 JOIN incidents i ON i.id = im.incident_id
				 WHERE i.source = 'auto' AND i.kind = ?3 AND i.resolved_at IS NULL`,
			).bind(rows, body, kind),
			env.DB.prepare(
				`UPDATE incidents SET
				 status = 'resolved', resolved_at = json_extract(j.value, '$.checkedAt'),
				 duration_ms = json_extract(j.value, '$.checkedAt') - incidents.started_at,
				 updated_at = json_extract(j.value, '$.checkedAt')
				 FROM json_each(?1) j JOIN incident_monitors im ON im.monitor_id = json_extract(j.value, '$.monitorId')
				 WHERE incidents.id = im.incident_id AND incidents.source = 'auto' AND incidents.kind = ?2 AND incidents.resolved_at IS NULL`,
			).bind(rows, kind),
		);
	};

	appendResolution(
		'down',
		persisted.filter((item) => !item.maintenance && item.transition === 'resolved'),
		RECOVERY_UPDATE_BODY,
	);
	if (options.degradedIncidents) {
		appendResolution(
			'degraded',
			persisted.filter((item) => !item.maintenance && item.latencyTransition === 'recovered'),
			DEGRADED_RECOVERY_UPDATE_BODY,
		);
		if (openedDown.length > 0) {
			const rows = JSON.stringify(openedDown.map(({ monitor, checkedAt }) => ({ monitorId: monitor.id, checkedAt: checkedAt.getTime() })));
			statements.push(
				env.DB.prepare(
					`INSERT INTO incident_updates (incident_id, status, body, source, created_at)
					 SELECT i.id, 'resolved', ?2, 'system', json_extract(j.value, '$.checkedAt')
					 FROM json_each(?1) j JOIN incident_monitors im ON im.monitor_id = json_extract(j.value, '$.monitorId')
					 JOIN incidents i ON i.id = im.incident_id
					 WHERE i.source = 'auto' AND i.kind = 'degraded' AND i.resolved_at IS NULL`,
				).bind(rows, DEGRADED_SUPERSEDED_UPDATE_BODY),
				env.DB.prepare(
					`UPDATE incidents SET status = 'resolved', resolved_at = json_extract(j.value, '$.checkedAt'),
					 duration_ms = json_extract(j.value, '$.checkedAt') - incidents.started_at,
					 updated_at = json_extract(j.value, '$.checkedAt')
					 FROM json_each(?1) j JOIN incident_monitors im ON im.monitor_id = json_extract(j.value, '$.monitorId')
					 WHERE incidents.id = im.incident_id AND incidents.source = 'auto' AND incidents.kind = 'degraded' AND incidents.resolved_at IS NULL`,
				).bind(rows),
			);
		}
	}

	await env.DB.batch(statements);
	return persisted.map(({ monitorUpdate: _monitorUpdate, ...item }) => item);
}
