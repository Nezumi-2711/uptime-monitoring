import { eq } from 'drizzle-orm';
import type { CheckResult, Monitor } from '../checks/run-check';
import { getDb } from '../db/client';
import { notificationSettings } from '../db/schema';

export type IncidentAlert = {
	monitor: Monitor;
	kind: 'opened' | 'resolved';
	result: CheckResult;
	at: Date;
};

type WebhookPayload = {
	event: 'down' | 'recovered' | 'test';
	monitor: { id: number; name: string; url: string };
	statusCode: number | null;
	error: string | null;
	at: string;
};

async function postWebhook(url: string, payload: WebhookPayload): Promise<boolean> {
	const response = await fetch(url, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'User-Agent': 'Upwatch/1.0 (+incident webhook)',
		},
		body: JSON.stringify(payload),
	});
	await response.body?.cancel();
	return response.ok;
}

export async function sendTestWebhook(url: string): Promise<boolean> {
	try {
		return await postWebhook(url, {
			event: 'test',
			monitor: { id: 0, name: 'Upwatch test', url: 'https://example.com/health' },
			statusCode: 200,
			error: null,
			at: new Date().toISOString(),
		});
	} catch (error) {
		console.error(
			JSON.stringify({
				message: 'test webhook failed',
				error: error instanceof Error ? error.message : String(error),
			}),
		);
		return false;
	}
}

export async function sendIncidentAlert(env: Env, alert: IncidentAlert): Promise<boolean> {
	if (!alert.monitor.alertsEnabled) return false;

	try {
		const [settings] = await getDb(env).select().from(notificationSettings).where(eq(notificationSettings.id, 1)).limit(1);
		if (!settings?.webhookEnabled || !settings.webhookUrl) return false;

		const ok = await postWebhook(settings.webhookUrl, {
			event: alert.kind === 'opened' ? 'down' : 'recovered',
			monitor: {
				id: alert.monitor.id,
				name: alert.monitor.name,
				url: alert.monitor.url,
			},
			statusCode: alert.result.statusCode,
			error: alert.result.error,
			at: alert.at.toISOString(),
		});
		if (!ok) {
			console.warn(
				JSON.stringify({
					message: 'incident webhook returned an error',
					monitorId: alert.monitor.id,
				}),
			);
		}
		return ok;
	} catch (error) {
		console.error(
			JSON.stringify({
				message: 'incident webhook failed',
				error: error instanceof Error ? error.message : String(error),
				monitorId: alert.monitor.id,
			}),
		);
		return false;
	}
}
