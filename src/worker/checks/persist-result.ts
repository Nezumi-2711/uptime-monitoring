import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { Database } from '../db/client';
import { checks, incidentMonitors, incidents, incidentUpdates, monitors } from '../db/schema';
import { RECOVERY_UPDATE_BODY } from '../ai/fallback-message';
import type { CheckResult, Monitor } from './run-check';

/** Only opened and resolved transitions are allowed to send alerts. */
export type CheckTransition = 'opened' | 'pending' | 'cleared' | 'resolved' | null;
export type AlertTransition = Extract<CheckTransition, 'opened' | 'resolved'>;
export type LatencyTransition = 'degraded' | 'recovered' | null;

type BatchStatement = Parameters<Database['batch']>[0][number];

export function buildResultStatements(db: Database, monitor: Monitor, result: CheckResult, checkedAt: Date, maintenance = false) {
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
			transition: null as CheckTransition,
			latencyTransition: null as LatencyTransition,
			consecutiveFailures: monitor.consecutiveFailures,
		};
	}

	const threshold = Math.max(1, monitor.failureThreshold);
	const previousFailures = monitor.consecutiveFailures;
	// This deliberately uses the monitor snapshot. Concurrent manual and scheduled checks may lose one increment,
	// which delays confirmation by one check but cannot publish a false incident.
	const nextFailures = result.ok ? 0 : previousFailures + 1;
	const nextSlow = result.degraded ? monitor.consecutiveSlow + 1 : 0;
	const wasDown = monitor.lastOk === false;
	const isDown = !result.ok && nextFailures >= threshold;
	const confirmed = result.ok ? true : isDown ? false : undefined;
	const confirmedDegraded = nextSlow >= threshold;
	const latencyTransition: LatencyTransition =
		!monitor.lastDegraded && confirmedDegraded ? 'degraded' : monitor.lastDegraded && !confirmedDegraded ? 'recovered' : null;

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
		statements.push(
			db.insert(incidents).values({
				status: 'investigating',
				impact: 'major',
				source: 'auto',
				startedAt: checkedAt,
				startStatusCode: result.statusCode,
				startError: result.error,
				createdAt: checkedAt,
				updatedAt: checkedAt,
			}),
			db.insert(incidentMonitors).values({ incidentId: sql`last_insert_rowid()`, monitorId: monitor.id }),
		);
		transition = 'opened';
	} else if (wasDown && result.ok) {
		const openIncidentIds = db
			.select({ id: incidentMonitors.incidentId })
			.from(incidentMonitors)
			.innerJoin(incidents, eq(incidents.id, incidentMonitors.incidentId))
			.where(and(eq(incidentMonitors.monitorId, monitor.id), eq(incidents.source, 'auto'), isNull(incidents.resolvedAt)));
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
					.where(and(eq(incidents.source, 'auto'), isNull(incidents.resolvedAt), inArray(incidents.id, openIncidentIds))),
			),
			db
				.update(incidents)
				.set({
					status: 'resolved',
					resolvedAt: checkedAt,
					durationMs: sql`${checkedAt.getTime()} - ${incidents.startedAt}`,
					updatedAt: checkedAt,
				})
				.where(and(eq(incidents.source, 'auto'), isNull(incidents.resolvedAt), inArray(incidents.id, openIncidentIds))),
		);
		transition = 'resolved';
	} else if (!wasDown && !result.ok) transition = 'pending';
	else if (!wasDown && result.ok && previousFailures > 0) transition = 'cleared';

	return { statements, transition, latencyTransition, consecutiveFailures: nextFailures };
}
