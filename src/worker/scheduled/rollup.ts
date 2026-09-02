export type DailyRollupSummary = {
	day: string;
	monitors: number;
};

export async function runDailyRollup(env: Env, now = new Date()): Promise<DailyRollupSummary> {
	const currentUtcDay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
	const dayStart = currentUtcDay - 24 * 60 * 60 * 1000;
	const dayEnd = currentUtcDay;
	const count = await env.DB.prepare(
		`SELECT count(DISTINCT monitor_id) AS count FROM checks
		 WHERE checked_at >= ?1 AND checked_at < ?2 AND maintenance = 0`,
	)
		.bind(dayStart, dayEnd)
		.first<{ count: number }>();
	await env.DB.prepare(
		`INSERT INTO monitor_daily_stats
		 (monitor_id, day, total_checks, up_checks, avg_latency_ms, min_latency_ms, max_latency_ms)
		 SELECT monitor_id, ?3, count(*), sum(CASE WHEN ok = 1 THEN 1 ELSE 0 END),
		        round(avg(latency_ms)), min(latency_ms), max(latency_ms)
		 FROM checks
		 WHERE checked_at >= ?1 AND checked_at < ?2 AND maintenance = 0
		 GROUP BY monitor_id
		 ON CONFLICT(monitor_id, day) DO UPDATE SET
		 total_checks = excluded.total_checks, up_checks = excluded.up_checks,
		 avg_latency_ms = excluded.avg_latency_ms, min_latency_ms = excluded.min_latency_ms,
		 max_latency_ms = excluded.max_latency_ms`,
	)
		.bind(dayStart, dayEnd, dayStart)
		.run();

	return { day: new Date(dayStart).toISOString().slice(0, 10), monitors: Number(count?.count ?? 0) };
}
