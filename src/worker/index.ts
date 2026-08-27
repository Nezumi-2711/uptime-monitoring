import { Hono } from "hono";
import { csrf } from "hono/csrf";
import authRoutes from "./routes/auth";
import { cleanupExpiredAuthRecords } from "./scheduled/cleanup";

const app = new Hono<{ Bindings: Env }>();

app.use("/api/auth/*", csrf());

app.get("/api/health", async (context) => {
	const db = await context.env.DB.prepare("SELECT 1 AS ok").first<{
		ok: number;
	}>();

	return context.json({
		ok: true,
		db,
		ts: Date.now(),
	});
});

app.route("/", authRoutes);

export default {
	fetch: app.fetch,
	async scheduled(controller, env) {
		await cleanupExpiredAuthRecords(env);
		console.log(
			JSON.stringify({
				message: "scheduled auth cleanup completed",
				cron: controller.cron,
				scheduledTime: controller.scheduledTime,
			}),
		);
	},
} satisfies ExportedHandler<Env>;
