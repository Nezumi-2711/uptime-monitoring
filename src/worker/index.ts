import { Hono } from "hono";
import { csrf } from "hono/csrf";
import { runDueChecks } from "./checks/run-due-checks";
import authRoutes from "./routes/auth";
import monitorRoutes from "./routes/monitors";
import { cleanupExpiredAuthRecords } from "./scheduled/cleanup";

const app = new Hono<{ Bindings: Env }>();

app.use("/api/*", csrf());

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
app.route("/api/monitors", monitorRoutes);

export default {
	fetch: app.fetch,
	async scheduled(controller, env) {
		await cleanupExpiredAuthRecords(env);
		const result = await runDueChecks(env);
		console.log(
			JSON.stringify({
				message: "scheduled run completed",
				cron: controller.cron,
				scheduledTime: controller.scheduledTime,
				...result,
			}),
		);
	},
} satisfies ExportedHandler<Env>;
