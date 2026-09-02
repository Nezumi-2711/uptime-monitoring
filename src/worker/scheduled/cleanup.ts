import { lt } from 'drizzle-orm';
import { getDb } from '../db/client';
import { aiEvents, checks, loginAttempts, monitorDailyStats, notificationDeliveries, sessions } from '../db/schema';

const LOGIN_ATTEMPT_RETENTION_MS = 60 * 60 * 1000;
const CHECK_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const DAILY_STATS_RETENTION_MS = 400 * 24 * 60 * 60 * 1000;
const DELIVERY_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export const AI_EVENT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Cheap, high-frequency cleanup for the every-5-minute cron. Only touches the auth tables,
 * which stay tiny and are indexed on the column filtered here, so each delete is a bounded
 * range scan. Security-sensitive (session expiry, login rate limiting) so it must stay fresh.
 */
export async function cleanupExpiredAuthRecords(env: Env) {
	const db = getDb(env);
	const now = new Date();

	await db.batch([
		db.delete(sessions).where(lt(sessions.expiresAt, now)),
		db.delete(loginAttempts).where(lt(loginAttempts.attemptedAt, new Date(now.getTime() - LOGIN_ATTEMPT_RETENTION_MS))),
	]);
}

/**
 * Retention pruning for the high-volume tables. Runs once per day from the rollup cron.
 *
 * At 20 monitors on 5-minute checks the `checks` table alone holds ~40k rows; running these
 * deletes every 5 minutes would scan the whole table each time and blow past D1's free-tier
 * "rows read" budget (~5M/day). Each column filtered below is backed by a single-column index
 * so the delete only scans the expiring slice, and running daily keeps that scan to ~one day
 * of rows.
 */
export async function cleanupStaleData(env: Env, now = new Date()) {
	const db = getDb(env);
	const checkCutoff = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - CHECK_RETENTION_MS;

	await db.batch([
		db.delete(checks).where(lt(checks.checkedAt, new Date(checkCutoff))),
		db.delete(monitorDailyStats).where(lt(monitorDailyStats.day, new Date(now.getTime() - DAILY_STATS_RETENTION_MS))),
		db.delete(notificationDeliveries).where(lt(notificationDeliveries.createdAt, new Date(now.getTime() - DELIVERY_RETENTION_MS))),
		db.delete(aiEvents).where(lt(aiEvents.createdAt, new Date(now.getTime() - AI_EVENT_RETENTION_MS))),
	]);
}
