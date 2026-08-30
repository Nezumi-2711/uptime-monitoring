import { and, eq, sql } from 'drizzle-orm';
import { generateIncidentMessage } from '../ai/incident-message';
import { getDb } from '../db/client';
import { monitors } from '../db/schema';
import { loadActiveMaintenance } from '../maintenance/windows';
import { dispatchNotification, MAX_NOTIFICATIONS_PER_RUN, type NotificationBudget } from '../notifications/dispatch';
import { type AlertTransition, buildResultStatements } from './persist-result';
import { runCheck, runCheckWithRetries, type RetryBudget } from './run-check';

const MAX_MONITORS_PER_RUN = 40;
const MAX_AI_MESSAGES_PER_RUN = 10;
const CONCURRENCY = 10;
export const MAX_RETRY_ATTEMPTS_PER_RUN = 60;
const RETRY_DEADLINE_MS = 90_000;

export type DueCheckSummary = {
	checked: number;
	up: number;
	down: number;
	pending: number;
	opened: number;
	retries: number;
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

	if (due.length === 0) return { checked: 0, up: 0, down: 0, pending: 0, opened: 0, retries: 0 };
	const activeMaintenance = await loadActiveMaintenance(db, new Date());
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
		...buildResultStatements(db, monitor, result, checkedAt, maintenance),
	}));
	const statements = persisted.flatMap((item) => item.statements);

	await db.batch(statements as [(typeof statements)[number], ...typeof statements]);

	let aiMessagesQueued = 0;
	const notificationBudget: NotificationBudget = { remaining: MAX_NOTIFICATIONS_PER_RUN };
	const notifications = persisted.flatMap((item) => {
		if (item.transition !== 'opened' && item.transition !== 'resolved') return [];
		const kind: AlertTransition = item.transition;
		const work: Promise<unknown>[] = [
			dispatchNotification(
				env,
				{
					monitor: { id: item.monitor.id, name: item.monitor.name, url: item.monitor.url },
					kind: kind === 'opened' ? 'down' : 'recovered',
					incidentId: null,
					title: kind === 'opened' ? `${item.monitor.name} is down` : `${item.monitor.name} recovered`,
					body: item.result.error,
					statusCode: item.result.statusCode,
					error: item.result.error,
					at: item.checkedAt,
				},
				notificationBudget,
			),
		];
		if (item.transition === 'opened' && item.monitor.alertsEnabled && aiMessagesQueued < MAX_AI_MESSAGES_PER_RUN) {
			aiMessagesQueued += 1;
			work.push(generateIncidentMessage(env, { monitor: item.monitor, result: item.result }));
		}
		return work;
	});
	if (notifications.length > 0) {
		const notificationWork = Promise.all(notifications).then(() => undefined);
		if (ctx) ctx.waitUntil(notificationWork);
		else await notificationWork;
	}

	const up = completed.reduce((count, item) => count + Number(item.result.ok), 0);
	return {
		checked: completed.length,
		up,
		down: completed.length - up,
		pending: persisted.reduce((count, item) => count + Number(item.transition === 'pending'), 0),
		opened: persisted.reduce((count, item) => count + Number(item.transition === 'opened'), 0),
		retries: completed.reduce((count, item) => count + item.result.attempts - 1, 0),
	};
}
