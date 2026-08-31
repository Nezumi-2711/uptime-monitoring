import { and, eq, sql } from 'drizzle-orm';
import type { AutopilotEvent } from '../autopilot';
import { getDb } from '../db/client';
import { aiSettings, monitors } from '../db/schema';
import { loadActiveMaintenance } from '../maintenance/windows';
import { buildAlertEvent } from '../notifications/compose';
import { dispatchNotification, MAX_NOTIFICATIONS_PER_RUN, type NotificationBudget } from '../notifications/dispatch';
import { buildResultStatements } from './persist-result';
import { runCheck, runCheckWithRetries, type RetryBudget } from './run-check';

const MAX_MONITORS_PER_RUN = 40;
const CONCURRENCY = 10;
const MAX_BATCH_STATEMENTS = 100;
export const MAX_RETRY_ATTEMPTS_PER_RUN = 60;
const RETRY_DEADLINE_MS = 90_000;

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

	if (due.length === 0) return { checked: 0, up: 0, down: 0, pending: 0, opened: 0, retries: 0, events: [] };
	const [activeMaintenance, [settings]] = await Promise.all([
		loadActiveMaintenance(db, new Date()),
		db.select().from(aiSettings).where(eq(aiSettings.id, 1)).limit(1),
	]);
	const budget: RetryBudget = { remaining: MAX_RETRY_ATTEMPTS_PER_RUN, deadline: Date.now() + RETRY_DEADLINE_MS };

	const completed: Array<{
		monitor: (typeof due)[number];
		result: Awaited<ReturnType<typeof runCheckWithRetries>>;
		checkedAt: Date;
		maintenance: boolean;
	}> = [];

	for (let offset = 0; offset < due.length; offset += CONCURRENCY) {
		const batch = due.slice(offset, offset + CONCURRENCY);
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

	const persisted = completed.map(({ monitor, result, checkedAt, maintenance }) => ({
		monitor,
		result,
		checkedAt,
		...buildResultStatements(db, monitor, result, checkedAt, maintenance, {
			degradedIncidents: Boolean(settings?.autopilotEnabled && settings.autopilotDegradedIncidents),
		}),
	}));
	let statementChunk: (typeof persisted)[number]['statements'] = [];
	for (const item of persisted) {
		if (statementChunk.length > 0 && statementChunk.length + item.statements.length > MAX_BATCH_STATEMENTS) {
			await db.batch(statementChunk as [(typeof statementChunk)[number], ...typeof statementChunk]);
			statementChunk = [];
		}
		statementChunk.push(...item.statements);
	}
	if (statementChunk.length > 0) await db.batch(statementChunk as [(typeof statementChunk)[number], ...typeof statementChunk]);

	const notificationBudget: NotificationBudget = { remaining: MAX_NOTIFICATIONS_PER_RUN };
	const notifications = persisted.flatMap((item) => {
		const work: Promise<unknown>[] = [];
		if (item.transition === 'opened' || item.transition === 'resolved') {
			work.push(dispatchNotification(env, buildAlertEvent(item.monitor, item.result, item.transition, item.checkedAt), notificationBudget));
		}
		if (item.latencyTransition) {
			work.push(
				dispatchNotification(env, buildAlertEvent(item.monitor, item.result, item.latencyTransition, item.checkedAt), notificationBudget),
			);
		}
		return work;
	});
	if (notifications.length > 0) {
		const notificationWork = Promise.all(notifications).then(() => undefined);
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
