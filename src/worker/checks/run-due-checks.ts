import { and, eq, inArray, sql } from 'drizzle-orm';
import type { AutopilotEvent } from '../autopilot';
import { getDb } from '../db/client';
import { aiSettings, monitors } from '../db/schema';
import { DEFAULT_RUN_LIMITS, resolveCheckRunConfig, resolveRunLimits } from '../lib/runtime-config';
import { loadActiveMaintenance } from '../maintenance/windows';
import { buildAlertEvent } from '../notifications/compose';
import { dispatchRunNotifications, type NotificationBudget } from '../notifications/dispatch';
import { persistScheduledResults } from './persist-result';
import { runCheck, runCheckWithRetries, type RetryBudget } from './run-check';

/** Default retry ceiling for one scheduled run; override with the RETRY_ATTEMPTS_PER_RUN env var. */
export const MAX_RETRY_ATTEMPTS_PER_RUN = DEFAULT_RUN_LIMITS.retryAttemptsPerRun;
const RETRY_DEADLINE_MS = 45_000;

export type DueCheckSummary = {
	checked: number;
	up: number;
	down: number;
	pending: number;
	opened: number;
	retries: number;
	events: AutopilotEvent[];
};

export async function runDueChecks(env: Env, ctx?: Pick<ExecutionContext, 'waitUntil'>): Promise<DueCheckSummary> {
	const db = getDb(env);
	const now = Date.now();
	const limits = resolveRunLimits(env);
	const { maxMonitorsPerRun, concurrency } = resolveCheckRunConfig(env);
	const dueIds = db
		.select({ id: monitors.id })
		.from(monitors)
		.where(
			and(
				eq(monitors.enabled, true),
				sql`(${monitors.lastCheckedAt} IS NULL OR ${monitors.lastCheckedAt} <= ${now} - ${monitors.intervalSeconds} * 1000)`,
			),
		)
		.orderBy(sql`${monitors.lastCheckedAt} ASC NULLS FIRST`)
		.limit(maxMonitorsPerRun);
	// Claim and return due monitors in one SQLite statement. Concurrent cron invocations serialize
	// this write, so a later invocation sees the claimed timestamp and cannot run the same monitor.
	const due = await db
		.update(monitors)
		.set({ lastCheckedAt: new Date(now) })
		.where(inArray(monitors.id, dueIds))
		.returning();

	if (due.length === 0) return { checked: 0, up: 0, down: 0, pending: 0, opened: 0, retries: 0, events: [] };
	const [activeMaintenance, [settings]] = await Promise.all([
		loadActiveMaintenance(db, new Date()),
		db.select().from(aiSettings).where(eq(aiSettings.id, 1)).limit(1),
	]);
	const budget: RetryBudget = { remaining: limits.retryAttemptsPerRun, deadline: Date.now() + RETRY_DEADLINE_MS };

	const completed: Array<{
		monitor: (typeof due)[number];
		result: Awaited<ReturnType<typeof runCheckWithRetries>>;
		checkedAt: Date;
		maintenance: boolean;
	}> = [];

	for (let offset = 0; offset < due.length; offset += concurrency) {
		const batch = due.slice(offset, offset + concurrency);
		const results = await Promise.all(
			batch.map(async (monitor) => {
				const maintenance = activeMaintenance.has(monitor.id);
				const retryable = !maintenance && monitor.retryCount > 0 && monitor.lastOk !== false;
				const result = retryable ? await runCheckWithRetries(monitor, budget) : { ...(await runCheck(monitor)), attempts: 1 };
				return { monitor, result, checkedAt: new Date(), maintenance };
			}),
		);
		completed.push(...results);
	}

	const persisted = await persistScheduledResults(env, completed, {
		degradedIncidents: Boolean(settings?.autopilotEnabled && settings.autopilotDegradedIncidents),
	});

	const notificationBudget: NotificationBudget = { remaining: limits.notificationsPerRun };
	const notificationEvents = persisted.flatMap((item) => {
		const events = [];
		if (item.transition === 'opened' || item.transition === 'resolved') {
			events.push({
				event: buildAlertEvent(item.monitor, item.result, item.transition, item.checkedAt),
				monitorAlertsEnabled: item.monitor.alertsEnabled,
			});
		}
		if (item.latencyTransition) {
			events.push({
				event: buildAlertEvent(item.monitor, item.result, item.latencyTransition, item.checkedAt),
				monitorAlertsEnabled: item.monitor.alertsEnabled,
			});
		}
		return events;
	});
	if (notificationEvents.length > 0) {
		const notificationWork = dispatchRunNotifications(env, notificationEvents, notificationBudget);
		if (ctx) ctx.waitUntil(notificationWork);
		else await notificationWork;
	}

	const up = completed.reduce((count, item) => count + Number(item.result.ok), 0);
	const events: AutopilotEvent[] = persisted
		.filter((item) => item.transition === 'opened' || item.transition === 'resolved' || item.latencyTransition !== null)
		.map((item) => ({
			monitor: item.monitor,
			result: item.result,
			transition: item.transition === 'opened' || item.transition === 'resolved' ? item.transition : null,
			latencyTransition: item.latencyTransition,
			checkedAt: item.checkedAt,
		}));
	return {
		checked: completed.length,
		up,
		down: completed.length - up,
		pending: persisted.reduce((count, item) => count + Number(item.transition === 'pending'), 0),
		opened: persisted.reduce((count, item) => count + Number(item.transition === 'opened'), 0),
		retries: completed.reduce((count, item) => count + item.result.attempts - 1, 0),
		events,
	};
}
