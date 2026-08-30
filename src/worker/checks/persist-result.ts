import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { Database } from '../db/client';
import { checks, incidentMonitors, incidents, incidentUpdates, monitors } from '../db/schema';
import { RECOVERY_UPDATE_BODY } from '../ai/fallback-message';
import type { CheckResult, Monitor } from './run-check';

export type IncidentTransition = 'opened' | 'resolved' | null;

type BatchStatement = Parameters<Database['batch']>[0][number];

export function buildResultStatements(db: Database, monitor: Monitor, result: CheckResult, checkedAt: Date, maintenance = false) {
	const statements: BatchStatement[] = [
		db.insert(checks).values({
			monitorId: monitor.id,
			ok: result.ok,
			statusCode: result.statusCode,
			latencyMs: result.latencyMs,
			error: result.error,
			checkedAt,
			maintenance,
		}),
		db
			.update(monitors)
			.set({
				...(maintenance ? {} : { lastOk: result.ok }),
				lastStatusCode: result.statusCode,
				lastLatencyMs: result.latencyMs,
				lastError: result.error,
				lastCheckedAt: checkedAt,
				updatedAt: checkedAt,
			})
			.where(eq(monitors.id, monitor.id)),
	];

	if (maintenance) return { statements, transition: null };

	let transition: IncidentTransition = null;
	if (monitor.lastOk !== false && !result.ok) {
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
	} else if (monitor.lastOk === false && result.ok) {
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
	}

	return { statements, transition };
}
