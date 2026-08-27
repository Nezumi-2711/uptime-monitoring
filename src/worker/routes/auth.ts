import { and, count, eq, gte } from "drizzle-orm";
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { getDb } from "../db/client";
import { loginAttempts, users } from "../db/schema";
import { verifyPassword } from "../lib/password";
import { requireAuth, type AuthVariables } from "../lib/require-auth";
import {
	createSession,
	getSessionUser,
	revokeSession,
	SESSION_COOKIE,
	sessionCookieOptions,
} from "../lib/session";

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = 10;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type LoginBody = {
	email?: unknown;
	password?: unknown;
};

const authRoutes = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

authRoutes.post("/api/auth/login", async (context) => {
	let body: LoginBody;
	try {
		body = await context.req.json<LoginBody>();
	} catch {
		return context.json({ message: "Invalid request body" }, 400);
	}

	if (
		typeof body.email !== "string" ||
		!EMAIL_PATTERN.test(body.email.trim()) ||
		typeof body.password !== "string" ||
		body.password.length < 8
	) {
		return context.json(
			{ message: "Enter a valid email and a password of at least 8 characters" },
			400,
		);
	}

	const db = getDb(context.env);
	const ipAddress = context.req.header("CF-Connecting-IP") ?? "unknown";
	const cutoff = new Date(Date.now() - LOGIN_WINDOW_MS);
	const [attemptResult] = await db
		.select({ value: count() })
		.from(loginAttempts)
		.where(
			and(
				eq(loginAttempts.ipAddress, ipAddress),
				gte(loginAttempts.attemptedAt, cutoff),
			),
		);

	if ((attemptResult?.value ?? 0) >= MAX_FAILED_ATTEMPTS) {
		return context.json(
			{ message: "Too many login attempts. Try again later" },
			429,
		);
	}

	const email = body.email.trim().toLowerCase();
	const [user] = await db
		.select({
			id: users.id,
			email: users.email,
			passwordHash: users.passwordHash,
		})
		.from(users)
		.where(eq(users.email, email))
		.limit(1);
	const passwordMatches = user
		? await verifyPassword(body.password, user.passwordHash)
		: false;

	if (!user || !passwordMatches) {
		await db.insert(loginAttempts).values({ ipAddress, attemptedAt: new Date() });
		return context.json({ message: "Email or password is incorrect" }, 401);
	}

	await db.delete(loginAttempts).where(eq(loginAttempts.ipAddress, ipAddress));
	const token = await createSession(
		db,
		user.id,
		context.req.header("User-Agent") ?? null,
	);
	setCookie(context, SESSION_COOKIE, token, sessionCookieOptions(context.req.url));

	return context.json({ user: { id: user.id, email: user.email } });
});

authRoutes.post("/api/auth/logout", requireAuth, async (context) => {
	const token = getCookie(context, SESSION_COOKIE);
	if (token) await revokeSession(getDb(context.env), token);

	deleteCookie(context, SESSION_COOKIE, {
		path: "/",
		secure: new URL(context.req.url).protocol === "https:",
	});
	return context.json({ ok: true });
});

authRoutes.get("/api/auth/me", async (context) => {
	const token = getCookie(context, SESSION_COOKIE);
	const user = token ? await getSessionUser(getDb(context.env), token) : null;
	return context.json({ user });
});

export default authRoutes;
