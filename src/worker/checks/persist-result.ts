import { and, eq, isNull, sql } from 'drizzle-orm';
import type { Database } from '../db/client';
import { checks, incidents, monitors } from '../db/schema';
import type { CheckResult, Monitor } from './run-check';

export type IncidentTransition = 'opened' | 'resolved' | null;

type BatchStatement = Parameters<Database['batch']>[0][number];

export function buildResultStatements(db: Database, monitor: Monitor, result: CheckResult, checkedAt: Date) {
	const statements: BatchStatement[] = [
		db.insert(checks).values({
			monitorId: monitor.id,
			ok: result.ok,
			statusCode: result.statusCode,
			latencyMs: result.latencyMs,
			error: result.error,
			checkedAt,
		}),
		db
			.update(monitors)
			.set({
				lastOk: result.ok,
				lastStatusCode: result.statusCode,
				lastLatencyMs: result.latencyMs,
				lastError: result.error,
				lastCheckedAt: checkedAt,
				updatedAt: checkedAt,
			})
			.where(eq(monitors.id, monitor.id)),
	];

	let transition: IncidentTransition = null;
	if (monitor.lastOk !== false && !result.ok) {
		statements.push(
			db.insert(incidents).values({
				monitorId: monitor.id,
				startedAt: checkedAt,
				startStatusCode: result.statusCode,
				startError: result.error,
				createdAt: checkedAt,
				updatedAt: checkedAt,
			}),
		);
		transition = 'opened';
	} else if (monitor.lastOk === false && result.ok) {
		statements.push(
			db
				.update(incidents)
				.set({
					resolvedAt: checkedAt,
					durationMs: sql`${checkedAt.getTime()} - ${incidents.startedAt}`,
					updatedAt: checkedAt,
				})
				.where(and(eq(incidents.monitorId, monitor.id), isNull(incidents.resolvedAt))),
		);
		transition = 'resolved';
	}

	return { statements, transition };
}
