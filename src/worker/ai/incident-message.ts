import { eq } from 'drizzle-orm';
import type { CheckResult, Monitor } from '../checks/run-check';
import { getDb } from '../db/client';
import { aiSettings } from '../db/schema';
import { requestCompletionDetailed } from './client';
import { recordAiEvent } from './events';
import { buildIncidentContext } from './incident-context';
import { sanitizePublicText } from './sanitize';

export const INCIDENT_MESSAGE_SYSTEM_PROMPT = [
	"You write short public status updates for a website's visitors.",
	'Your reader is a non-technical customer, not an engineer, and should not need any background to understand you.',
	'',
	'Write exactly two plain-English sentences:',
	'1. What visitors may notice right now, described purely by its effect on them (pages not loading, sign-in failing, checkout not going through, slow responses). Never state the technical cause.',
	'2. A calm reassurance that the problem has been detected automatically, the team has been alerted, and work to restore the service is already underway and will be completed as soon as possible.',
	'',
	'Rules:',
	'- Never include URLs, hostnames, domain names, IP addresses, port numbers, file paths, HTTP status codes, error codes, or stack traces.',
	'- Never name the technical fault (timeout, DNS, TLS, certificate, server, database, rate limit, etc.).',
	'- No blame, no alarm, no speculation, and do not promise a specific fix time.',
	'- Keep the whole update under 240 characters. Output only the two sentences and nothing else.',
].join('\n');

export function sanitizeIncidentMessage(value: string): string | null {
	return sanitizePublicText(value, 280);
}

export async function generateIncidentMessage(env: Env, input: { monitor: Monitor; result: CheckResult }): Promise<string | null> {
	if (!input.monitor.alertsEnabled) return null;
	try {
		const db = getDb(env);
		const [settings] = await db.select().from(aiSettings).where(eq(aiSettings.id, 1)).limit(1);
		if (!settings?.enabled || !settings.baseUrl || !settings.apiKey || !settings.model) return null;

		const context = await buildIncidentContext(db, input.monitor, input.result);
		const result = await requestCompletionDetailed(
			{ baseUrl: settings.baseUrl, apiKey: settings.apiKey, model: settings.model },
			INCIDENT_MESSAGE_SYSTEM_PROMPT,
			context,
		);
		const message = result.content ? sanitizeIncidentMessage(result.content) : null;
		if (!message) {
			await recordAiEvent(env, {
				kind: 'incident_open',
				monitorId: input.monitor.id,
				model: settings.model,
				outcome: result.failure ? 'failed' : 'rejected',
				reason: result.failure ?? 'sanitizer_rejected',
				latencyMs: result.latencyMs,
				promptTokens: result.promptTokens,
				completionTokens: result.completionTokens,
				contextPreview: context,
				outputPreview: result.content,
			});
			return null;
		}

		await env.DB.prepare(
			`INSERT INTO incident_updates (incident_id, status, body, source, created_at)
			 SELECT i.id, 'investigating', ?, 'ai', ?
			 FROM incidents i
			 JOIN incident_monitors im ON im.incident_id = i.id
			 WHERE im.monitor_id = ? AND i.source = 'auto' AND i.resolved_at IS NULL
			   AND NOT EXISTS (
			     SELECT 1 FROM incident_updates iu WHERE iu.incident_id = i.id AND iu.source = 'ai'
			   )`,
		)
			.bind(message, Date.now(), input.monitor.id)
			.run();
		await recordAiEvent(env, {
			kind: 'incident_open',
			monitorId: input.monitor.id,
			model: settings.model,
			outcome: 'ok',
			latencyMs: result.latencyMs,
			promptTokens: result.promptTokens,
			completionTokens: result.completionTokens,
			contextPreview: context,
			outputPreview: result.content,
		});
		return message;
	} catch (error) {
		console.warn(
			JSON.stringify({
				message: 'incident message generation failed',
				error: error instanceof Error ? error.message : String(error),
				monitorId: input.monitor.id,
			}),
		);
		return null;
	}
}
