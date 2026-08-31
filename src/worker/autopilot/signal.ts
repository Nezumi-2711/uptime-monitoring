import { and, asc, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import type { CheckResult, Monitor } from '../checks/run-check';
import type { Database } from '../db/client';
import { checks, incidentMonitors, incidents, incidentUpdates, monitors } from '../db/schema';
import { classifyFailure } from '../lib/humanize';

export type IncidentSignal = {
	monitor: Monitor;
	recentChecks: Array<{ ok: boolean; statusCode: number | null; latencyMs: number | null; error: string | null }>;
	consecutiveFailures: number;
	consecutiveOk: number;
	failureSignatureStable: boolean;
	latestOk: boolean;
	regressionUsed: boolean;
	affectedMonitors: number;
	totalMonitors: number;
};

export async function findLatestAutoIncidentForMonitor(
	db: Database,
	monitorId: number,
	options: { resolved: boolean; kind?: 'down' | 'degraded' },
) {
	const [incident] = await db
		.select()
		.from(incidents)
		.innerJoin(incidentMonitors, eq(incidentMonitors.incidentId, incidents.id))
		.where(
			and(
				eq(incidentMonitors.monitorId, monitorId),
				eq(incidents.source, 'auto'),
				options.kind ? eq(incidents.kind, options.kind) : undefined,
				options.resolved ? isNotNull(incidents.resolvedAt) : isNull(incidents.resolvedAt),
			),
		)
		.orderBy(desc(incidents.startedAt))
		.limit(1);
	return incident?.incidents ?? null;
}

export async function loadIncidentSignal(db: Database, incidentId: number): Promise<IncidentSignal | null> {
	const [monitor] = await db
		.select({ monitor: monitors })
		.from(incidentMonitors)
		.innerJoin(monitors, eq(monitors.id, incidentMonitors.monitorId))
		.where(eq(incidentMonitors.incidentId, incidentId))
		.orderBy(asc(incidentMonitors.monitorId))
		.limit(1);
	if (!monitor) return null;

	const recentChecks = await db
		.select({ ok: checks.ok, statusCode: checks.statusCode, latencyMs: checks.latencyMs, error: checks.error })
		.from(checks)
		.where(and(eq(checks.monitorId, monitor.monitor.id), eq(checks.maintenance, false)))
		.orderBy(desc(checks.checkedAt))
		.limit(10);
	let consecutiveFailures = 0;
	let consecutiveOk = 0;
	for (const check of recentChecks) {
		if (check.ok) break;
		consecutiveFailures += 1;
	}
	for (const check of recentChecks) {
		if (!check.ok) break;
		consecutiveOk += 1;
	}
	const failureSignatures = recentChecks.slice(0, consecutiveFailures).map((check) =>
		classifyFailure(monitor.monitor, {
			ok: check.ok,
			degraded: false,
			statusCode: check.statusCode,
			latencyMs: check.latencyMs ?? 0,
			error: check.error,
		} satisfies CheckResult),
	);
	const statusHistory = await db
		.select({ status: incidentUpdates.status })
		.from(incidentUpdates)
		.where(eq(incidentUpdates.incidentId, incidentId))
		.orderBy(incidentUpdates.createdAt, incidentUpdates.id);
	const monitoringIndex = statusHistory.findIndex((update) => update.status === 'monitoring');
	const regressionUsed = monitoringIndex >= 0 && statusHistory.slice(monitoringIndex + 1).some((update) => update.status === 'identified');
	const [affected] = await db
		.select({ count: sql<number>`count(*)` })
		.from(incidentMonitors)
		.where(eq(incidentMonitors.incidentId, incidentId));
	const [total] = await db
		.select({ count: sql<number>`count(*)` })
		.from(monitors)
		.where(eq(monitors.enabled, true));
	return {
		monitor: monitor.monitor,
		recentChecks,
		consecutiveFailures,
		consecutiveOk,
		failureSignatureStable: failureSignatures.length >= 3 && new Set(failureSignatures).size === 1,
		latestOk: recentChecks[0]?.ok ?? false,
		regressionUsed,
		affectedMonitors: Number(affected?.count ?? 1),
		totalMonitors: Number(total?.count ?? 1),
	};
}
