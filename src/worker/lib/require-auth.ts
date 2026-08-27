import { getCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import { getDb } from "../db/client";
import { hasValidSession, SESSION_COOKIE } from "./session";

export type AuthVariables = {
	authenticated: true;
};

export const requireAuth = createMiddleware<{
	Bindings: Env;
	Variables: AuthVariables;
}>(async (context, next) => {
	const token = getCookie(context, SESSION_COOKIE);
	if (!token) return context.json({ message: "Authentication required" }, 401);

	const authenticated = await hasValidSession(getDb(context.env), token);
	if (!authenticated) return context.json({ message: "Authentication required" }, 401);

	context.set("authenticated", true);
	await next();
});
