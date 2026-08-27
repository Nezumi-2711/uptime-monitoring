import { and, eq, gt } from "drizzle-orm";
import type { CookieOptions } from "hono/utils/cookie";
import type { Database } from "../db/client";
import { sessions, users } from "../db/schema";

export const SESSION_COOKIE = "upwatch_session";
export const SESSION_DURATION_SECONDS = 7 * 24 * 60 * 60;

export type SessionUser = {
	id: string;
	email: string;
};

function bytesToBase64Url(bytes: Uint8Array) {
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

async function sha256Hex(value: string) {
	const digest = new Uint8Array(
		await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
	);
	return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function sessionCookieOptions(requestUrl: string): CookieOptions {
	return {
		httpOnly: true,
		sameSite: "Lax",
		path: "/",
		maxAge: SESSION_DURATION_SECONDS,
		secure: new URL(requestUrl).protocol === "https:",
	};
}

export async function createSession(
	db: Database,
	userId: string,
	userAgent: string | null,
) {
	const token = bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)));
	const now = new Date();

	await db.insert(sessions).values({
		id: await sha256Hex(token),
		userId,
		createdAt: now,
		expiresAt: new Date(now.getTime() + SESSION_DURATION_SECONDS * 1000),
		userAgent,
	});

	return token;
}

export async function getSessionUser(
	db: Database,
	token: string,
): Promise<SessionUser | null> {
	const [result] = await db
		.select({ id: users.id, email: users.email })
		.from(sessions)
		.innerJoin(users, eq(sessions.userId, users.id))
		.where(
			and(
				eq(sessions.id, await sha256Hex(token)),
				gt(sessions.expiresAt, new Date()),
			),
		)
		.limit(1);

	return result ?? null;
}

export async function revokeSession(db: Database, token: string) {
	await db.delete(sessions).where(eq(sessions.id, await sha256Hex(token)));
}
