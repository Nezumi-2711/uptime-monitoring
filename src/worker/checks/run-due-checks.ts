import { and, eq, sql } from "drizzle-orm";
import { getDb } from "../db/client";
import { checks, monitors } from "../db/schema";
import { runCheck } from "./run-check";

const MAX_MONITORS_PER_RUN = 40;
const CONCURRENCY = 10;

export type DueCheckSummary = {
	checked: number;
	up: number;
	down: number;
};

export async function runDueChecks(env: Env): Promise<DueCheckSummary> {
	const db = getDb(env);
	const now = Date.now();
	const due = await db
		.select()
		.from(monitors)
		.where(
			and(
				eq(monitors.enabled, true),
				sql`(${monitors.lastCheckedAt} IS NULL OR ${monitors.lastCheckedAt} <= ${now} - ${monitors.intervalSeconds} * 1000)`,
			),
		)
		.orderBy(sql`${monitors.lastCheckedAt} ASC NULLS FIRST`)
		.limit(MAX_MONITORS_PER_RUN);

	if (due.length === 0) return { checked: 0, up: 0, down: 0 };

	const completed: Array<{
		monitor: (typeof due)[number];
		result: Awaited<ReturnType<typeof runCheck>>;
		checkedAt: Date;
	}> = [];

	for (let offset = 0; offset < due.length; offset += CONCURRENCY) {
		const batch = due.slice(offset, offset + CONCURRENCY);
		const results = await Promise.all(
			batch.map(async (monitor) => ({
				monitor,
				result: await runCheck(monitor),
				checkedAt: new Date(),
			})),
		);
		completed.push(...results);
	}

	const statements = completed.flatMap(({ monitor, result, checkedAt }) => [
		db.insert(checks).values({
			monitorId: monitor.id,
			ok: result.ok,
			statusCode: result.statusCode,
			latencyMs: result.latencyMs,
			error: result.error,
			checkedAt,
		}),
		db.update(monitors).set({
			lastOk: result.ok,
			lastStatusCode: result.statusCode,
			lastLatencyMs: result.latencyMs,
			lastError: result.error,
			lastCheckedAt: checkedAt,
			updatedAt: checkedAt,
		}).where(eq(monitors.id, monitor.id)),
	]);

	await db.batch(statements as [typeof statements[number], ...typeof statements]);

	const up = completed.reduce((count, item) => count + Number(item.result.ok), 0);
	return { checked: completed.length, up, down: completed.length - up };
}
