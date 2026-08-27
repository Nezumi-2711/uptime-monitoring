import { lt } from "drizzle-orm";
import { getDb } from "../db/client";
import { checks, loginAttempts, sessions } from "../db/schema";

const LOGIN_ATTEMPT_RETENTION_MS = 60 * 60 * 1000;
const CHECK_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export async function cleanupExpiredAuthRecords(env: Env) {
	const db = getDb(env);
	const now = new Date();

	await db.batch([
		db.delete(sessions).where(lt(sessions.expiresAt, now)),
		db
			.delete(loginAttempts)
			.where(
				lt(
					loginAttempts.attemptedAt,
					new Date(now.getTime() - LOGIN_ATTEMPT_RETENTION_MS),
				),
			),
		db
			.delete(checks)
			.where(
				lt(
					checks.checkedAt,
					new Date(now.getTime() - CHECK_RETENTION_MS),
				),
			),
	]);
}
