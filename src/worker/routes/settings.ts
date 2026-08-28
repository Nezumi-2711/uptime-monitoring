import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { getDb } from "../db/client";
import { notificationSettings } from "../db/schema";
import { requireAuth, type AuthVariables } from "../lib/require-auth";
import { sendTestWebhook } from "../notifications/webhook";

type NotificationInput = {
	webhookUrl: string | null;
	webhookEnabled: boolean;
};

function parseNotificationInput(value: unknown): NotificationInput | string {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return "Invalid request body";
	}
	const body = value as Record<string, unknown>;
	if (typeof body.webhookEnabled !== "boolean") {
		return "webhookEnabled must be a boolean";
	}
	const rawUrl = typeof body.webhookUrl === "string" ? body.webhookUrl.trim() : body.webhookUrl;
	if (rawUrl !== null && typeof rawUrl !== "string") return "webhookUrl must be a URL or null";
	let webhookUrl = rawUrl || null;
	if (webhookUrl) {
		try {
			const url = new URL(webhookUrl);
			if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("protocol");
			webhookUrl = url.toString();
		} catch {
			return "Enter a valid http or https webhook URL";
		}
	}
	if (body.webhookEnabled && !webhookUrl) return "A webhook URL is required when alerts are enabled";
	return { webhookUrl, webhookEnabled: body.webhookEnabled };
}

const settingsRoutes = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
settingsRoutes.use("*", requireAuth);

settingsRoutes.get("/notifications", async (context) => {
	const [settings] = await getDb(context.env)
		.select()
		.from(notificationSettings)
		.where(eq(notificationSettings.id, 1))
		.limit(1);
	return context.json({
		settings: settings ?? { id: 1, webhookUrl: null, webhookEnabled: false, createdAt: null, updatedAt: null },
	});
});

settingsRoutes.put("/notifications", async (context) => {
	let body: unknown;
	try {
		body = await context.req.json();
	} catch {
		return context.json({ message: "Invalid request body" }, 400);
	}
	const input = parseNotificationInput(body);
	if (typeof input === "string") return context.json({ message: input }, 400);

	const db = getDb(context.env);
	const now = new Date();
	const [settings] = await db
		.insert(notificationSettings)
		.values({ id: 1, ...input, createdAt: now, updatedAt: now })
		.onConflictDoUpdate({
			target: notificationSettings.id,
			set: { ...input, updatedAt: now },
		})
		.returning();
	return context.json({ settings });
});

settingsRoutes.post("/notifications/test", async (context) => {
	const [settings] = await getDb(context.env)
		.select()
		.from(notificationSettings)
		.where(eq(notificationSettings.id, 1))
		.limit(1);
	if (!settings?.webhookUrl) return context.json({ message: "Save a webhook URL first" }, 400);
	const delivered = await sendTestWebhook(settings.webhookUrl);
	if (!delivered) return context.json({ message: "Webhook delivery failed" }, 502);
	return context.json({ ok: true });
});

export default settingsRoutes;
