import { and, eq, isNull } from 'drizzle-orm';
import type { CheckResult, Monitor } from '../checks/run-check';
import { getDb } from '../db/client';
import { aiSettings, incidents } from '../db/schema';
import { requestCompletion } from './client';
import { buildIncidentContext } from './incident-context';

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
	const message = value
		.replace(/\r/g, '')
		.trim()
		.replace(/^(?:message|update|status)\s*:\s*/i, '')
		.replace(/^(["'])([\s\S]*)\1$/, '$2')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, 280);
	if (!message) return null;
	// Reject anything that leaked a technical detail past the prompt.
	if (/https?:\/\//i.test(message)) return null;
	if (/\b(?:\d{1,3}\.){3}\d{1,3}\b/.test(message)) return null;
	if (/\bHTTP[\s/]?\d{3}\b/i.test(message) || /\b[45]\d{2}\s+(?:error|status|response)\b/i.test(message)) return null;
	return message;
}

export async function generateIncidentMessage(env: Env, input: { monitor: Monitor; result: CheckResult }): Promise<string | null> {
	if (!input.monitor.alertsEnabled) return null;
	try {
		const db = getDb(env);
		const [settings] = await db.select().from(aiSettings).where(eq(aiSettings.id, 1)).limit(1);
		if (!settings?.enabled || !settings.baseUrl || !settings.apiKey || !settings.model) return null;

		const content = await requestCompletion(
			{ baseUrl: settings.baseUrl, apiKey: settings.apiKey, model: settings.model },
			INCIDENT_MESSAGE_SYSTEM_PROMPT,
			await buildIncidentContext(db, input.monitor, input.result),
		);
		if (!content) return null;
		const message = sanitizeIncidentMessage(content);
		if (!message) return null;

		await db
			.update(incidents)
			.set({ aiMessage: message, updatedAt: new Date() })
			.where(and(eq(incidents.monitorId, input.monitor.id), isNull(incidents.resolvedAt)));
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
