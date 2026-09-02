import { getDb } from '../db/client';
import { aiEvents } from '../db/schema';

export type AiEventKind = 'incident_open' | 'incident_followup' | 'incident_resolve' | 'degraded_open' | 'manual_draft' | 'settings_test';
export type AiEventOutcome = 'ok' | 'rejected' | 'failed' | 'skipped_budget' | 'skipped_standdown';

export type AiEventInput = {
	kind: AiEventKind;
	incidentId?: number | null;
	monitorId?: number | null;
	model?: string | null;
	outcome: AiEventOutcome;
	reason?: string | null;
	latencyMs?: number | null;
	promptTokens?: number | null;
	completionTokens?: number | null;
	contextPreview?: string | null;
	outputPreview?: string | null;
};

function preview(value: string | null | undefined) {
	if (!value) return null;
	return value
		.replace(/https?:\/\/\S+/gi, '[redacted-url]')
		.replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[redacted-ip]')
		.replace(/\b(?:[a-z0-9-]+\.)+[a-z]{2,}\b/gi, '[redacted-host]')
		.replace(/\b(?:sk|pk|rk)-[a-z0-9_-]+\b/gi, '[redacted-key]')
		.replace(/\bBearer\s+\S+/gi, 'Bearer [redacted]')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, 240);
}

export async function recordAiEvent(env: Env, input: AiEventInput): Promise<void> {
	try {
		await getDb(env)
			.insert(aiEvents)
			.values({
				kind: input.kind,
				incidentId: input.incidentId ?? null,
				monitorId: input.monitorId ?? null,
				model: input.model ?? null,
				outcome: input.outcome,
				reason: preview(input.reason)?.slice(0, 200) ?? null,
				latencyMs: input.latencyMs ?? null,
				promptTokens: input.promptTokens ?? null,
				completionTokens: input.completionTokens ?? null,
				contextPreview: preview(input.contextPreview),
				outputPreview: preview(input.outputPreview),
				createdAt: new Date(),
			});
	} catch (error) {
		console.warn(JSON.stringify({ message: 'AI event recording failed', error: error instanceof Error ? error.message : String(error) }));
	}
}

export async function recordAiEvents(env: Env, inputs: AiEventInput[]): Promise<void> {
	if (inputs.length === 0) return;
	try {
		await env.DB.prepare(
			`INSERT INTO ai_events
			 (kind, incident_id, monitor_id, model, outcome, reason, latency_ms, prompt_tokens, completion_tokens,
			  context_preview, output_preview, created_at)
			 SELECT json_extract(value, '$.kind'), json_extract(value, '$.incidentId'), json_extract(value, '$.monitorId'),
			        json_extract(value, '$.model'), json_extract(value, '$.outcome'), json_extract(value, '$.reason'),
			        json_extract(value, '$.latencyMs'), json_extract(value, '$.promptTokens'), json_extract(value, '$.completionTokens'),
			        json_extract(value, '$.contextPreview'), json_extract(value, '$.outputPreview'), ?2
			 FROM json_each(?1)`,
		)
			.bind(
				JSON.stringify(
					inputs.map((input) => ({
						kind: input.kind,
						incidentId: input.incidentId ?? null,
						monitorId: input.monitorId ?? null,
						model: input.model ?? null,
						outcome: input.outcome,
						reason: preview(input.reason)?.slice(0, 200) ?? null,
						latencyMs: input.latencyMs ?? null,
						promptTokens: input.promptTokens ?? null,
						completionTokens: input.completionTokens ?? null,
						contextPreview: preview(input.contextPreview),
						outputPreview: preview(input.outputPreview),
					})),
				),
				Date.now(),
			)
			.run();
	} catch (error) {
		console.warn(
			JSON.stringify({ message: 'AI event batch recording failed', error: error instanceof Error ? error.message : String(error) }),
		);
	}
}
