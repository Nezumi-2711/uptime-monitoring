import { and, gte, lt, sql } from "drizzle-orm";
import { getDb } from "../db/client";
import { checks, monitorDailyStats } from "../db/schema";

export type DailyRollupSummary = {
	day: string;
	monitors: number;
};

export async function runDailyRollup(
	env: Env,
	now = new Date(),
): Promise<DailyRollupSummary> {
	const db = getDb(env);
	const currentUtcDay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
	const dayStart = new Date(currentUtcDay - 24 * 60 * 60 * 1000);
	const dayEnd = new Date(currentUtcDay);

	const rows = await db
		.select({
			monitorId: checks.monitorId,
			totalChecks: sql<number>`count(*)`,
			upChecks: sql<number>`sum(case when ${checks.ok} = 1 then 1 else 0 end)`,
			avgLatencyMs: sql<number | null>`round(avg(${checks.latencyMs}))`,
			minLatencyMs: sql<number | null>`min(${checks.latencyMs})`,
			maxLatencyMs: sql<number | null>`max(${checks.latencyMs})`,
		})
		.from(checks)
		.where(and(gte(checks.checkedAt, dayStart), lt(checks.checkedAt, dayEnd)))
		.groupBy(checks.monitorId);

	if (rows.length > 0) {
		const statements = rows.map((row) => db
			.insert(monitorDailyStats)
			.values({
				monitorId: row.monitorId,
				day: dayStart,
				totalChecks: row.totalChecks,
				upChecks: row.upChecks,
				avgLatencyMs: row.avgLatencyMs,
				minLatencyMs: row.minLatencyMs,
				maxLatencyMs: row.maxLatencyMs,
			})
			.onConflictDoUpdate({
				target: [monitorDailyStats.monitorId, monitorDailyStats.day],
				set: {
					totalChecks: row.totalChecks,
					upChecks: row.upChecks,
					avgLatencyMs: row.avgLatencyMs,
					minLatencyMs: row.minLatencyMs,
					maxLatencyMs: row.maxLatencyMs,
				},
			}));
		await db.batch(statements as [typeof statements[number], ...typeof statements]);
	}

	return { day: dayStart.toISOString().slice(0, 10), monitors: rows.length };
}
