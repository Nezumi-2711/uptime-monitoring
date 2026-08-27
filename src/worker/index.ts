import { Hono } from "hono";

const app = new Hono<{ Bindings: Env }>();

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

export default {
	fetch: app.fetch,
	scheduled(controller) {
		console.log(
			JSON.stringify({
				message: "scheduled smoke test",
				cron: controller.cron,
				scheduledTime: controller.scheduledTime,
			}),
		);
	},
} satisfies ExportedHandler<Env>;
