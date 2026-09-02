import { Hono } from 'hono';
import { csrf } from 'hono/csrf';
import { runAutopilot } from './autopilot';
import { runDueChecks } from './checks/run-due-checks';
import authRoutes from './routes/auth';
import channelRoutes from './routes/channels';
import incidentRoutes from './routes/incidents';
import maintenanceRoutes from './routes/maintenance';
import monitorRoutes from './routes/monitors';
import { createPageRoutes } from './routes/pages';
import settingsRoutes from './routes/settings';
import statusRoutes from './routes/status';
import { cleanupExpiredAuthRecords, cleanupStaleData } from './scheduled/cleanup';
import { runDailyRollup } from './scheduled/rollup';

const app = new Hono<{ Bindings: Env }>();

export function shouldRunFiveMinuteWork(scheduledTime: number): boolean {
	return new Date(scheduledTime).getUTCMinutes() % 5 === 0;
}

app.use('/api/*', csrf());

app.route(
	'/',
	createPageRoutes((request, env, executionCtx) => app.fetch(request, env, executionCtx)),
);

app.get('/api/health', async (context) => {
	const db = await context.env.DB.prepare('SELECT 1 AS ok').first<{
		ok: number;
	}>();

	return context.json({
		ok: true,
		db,
		ts: Date.now(),
	});
});

app.route('/', authRoutes);
app.route('/api/channels', channelRoutes);
app.route('/api/incidents', incidentRoutes);
app.route('/api/maintenance', maintenanceRoutes);
app.route('/api/monitors', monitorRoutes);
app.route('/api/settings', settingsRoutes);
app.route('/api/status', statusRoutes);

export default {
	fetch: app.fetch,
	async scheduled(controller, env, ctx) {
		if (controller.cron === '5 0 * * *') {
			const scheduledAt = new Date(controller.scheduledTime);
			const result = await runDailyRollup(env, scheduledAt);
			await cleanupStaleData(env, scheduledAt);
			console.log(
				JSON.stringify({
					message: 'daily rollup completed',
					cron: controller.cron,
					scheduledTime: controller.scheduledTime,
					...result,
				}),
			);
			return;
		}

		const runFiveMinuteWork = shouldRunFiveMinuteWork(controller.scheduledTime);
		if (runFiveMinuteWork) await cleanupExpiredAuthRecords(env);
		const result = await runDueChecks(env, ctx);
		ctx.waitUntil(
			runAutopilot(env, { events: result.events, skipSweep: !runFiveMinuteWork }).then((autopilot) => {
				console.log(JSON.stringify({ message: 'autopilot run completed', ...autopilot }));
			}),
		);
		console.log(
			JSON.stringify({
				message: 'scheduled run completed',
				cron: controller.cron,
				scheduledTime: controller.scheduledTime,
				...result,
				events: result.events.length,
			}),
		);
	},
} satisfies ExportedHandler<Env>;
