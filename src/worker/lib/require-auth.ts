import { getCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import { getDb } from "../db/client";
import { getSessionUser, SESSION_COOKIE, type SessionUser } from "./session";

export type AuthVariables = {
	user: SessionUser;
};

export const requireAuth = createMiddleware<{
	Bindings: Env;
	Variables: AuthVariables;
}>(async (context, next) => {
	const token = getCookie(context, SESSION_COOKIE);
	if (!token) return context.json({ message: "Authentication required" }, 401);

	const user = await getSessionUser(getDb(context.env), token);
	if (!user) return context.json({ message: "Authentication required" }, 401);

	context.set("user", user);
	await next();
});
