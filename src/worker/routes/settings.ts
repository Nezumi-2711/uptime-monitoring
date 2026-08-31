import { desc, eq, gte, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { requestCompletionDetailed } from '../ai/client';
import { recordAiEvent } from '../ai/events';
import { SAMPLE_INCIDENT_CONTEXT } from '../ai/incident-context';
import { INCIDENT_MESSAGE_SYSTEM_PROMPT, sanitizeIncidentMessage } from '../ai/incident-message';
import { getDb } from '../db/client';
import { aiEvents, aiSettings } from '../db/schema';
import { requireAuth, type AuthVariables } from '../lib/require-auth';
import { isSafeRemoteUrl } from '../lib/safe-url';

type AiInput = {
	enabled: boolean;
	baseUrl: string | null;
	model: string | null;
	apiKey?: string;
	autopilotEnabled: boolean;
	autopilotFollowupMinutes: number;
	autopilotMaxUpdates: number;
	autopilotAdvanceStatus: boolean;
	autopilotDegradedIncidents: boolean;
};

function clampInteger(value: unknown, fallback: number, minimum: number, maximum: number) {
	return typeof value === 'number' && Number.isSafeInteger(value) ? Math.min(maximum, Math.max(minimum, value)) : fallback;
}

function parseAiInput(value: unknown): AiInput | string {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		return 'Invalid request body';
	}
	const body = value as Record<string, unknown>;
	if (typeof body.enabled !== 'boolean') return 'enabled must be a boolean';
	if (body.autopilotEnabled !== undefined && typeof body.autopilotEnabled !== 'boolean') return 'autopilotEnabled must be a boolean';
	if (body.autopilotAdvanceStatus !== undefined && typeof body.autopilotAdvanceStatus !== 'boolean') {
		return 'autopilotAdvanceStatus must be a boolean';
	}
	if (body.autopilotDegradedIncidents !== undefined && typeof body.autopilotDegradedIncidents !== 'boolean') {
		return 'autopilotDegradedIncidents must be a boolean';
	}

	const rawBaseUrl = typeof body.baseUrl === 'string' ? body.baseUrl.trim() : body.baseUrl;
	if (rawBaseUrl !== null && typeof rawBaseUrl !== 'string') return 'baseUrl must be a URL or null';
	let baseUrl = rawBaseUrl || null;
	if (baseUrl) {
		try {
			const url = new URL(baseUrl);
			if (url.protocol !== 'https:' || !isSafeRemoteUrl(url)) throw new Error('unsafe URL');
			baseUrl = url.toString().replace(/\/+$/, '');
		} catch {
			return 'Enter a valid public https base URL';
		}
	}

	const rawModel = typeof body.model === 'string' ? body.model.trim() : body.model;
	if (rawModel !== null && typeof rawModel !== 'string') return 'model must be a string or null';
	const model = rawModel || null;
	if (model && model.length > 100) return 'model must be between 1 and 100 characters';

	let apiKey: string | undefined;
	if (body.apiKey !== undefined && body.apiKey !== null) {
		if (typeof body.apiKey !== 'string') return 'apiKey must be a string, null, or omitted';
		apiKey = body.apiKey.trim();
	}

	return {
		enabled: body.enabled,
		baseUrl,
		model,
		apiKey,
		autopilotEnabled: body.autopilotEnabled ?? false,
		autopilotFollowupMinutes: clampInteger(body.autopilotFollowupMinutes, 15, 5, 240),
		autopilotMaxUpdates: clampInteger(body.autopilotMaxUpdates, 6, 1, 20),
		autopilotAdvanceStatus: body.autopilotAdvanceStatus ?? false,
		autopilotDegradedIncidents: body.autopilotDegradedIncidents ?? false,
	};
}

function publicAiSettings(settings: typeof aiSettings.$inferSelect | undefined) {
	return {
		id: 1,
		enabled: settings?.enabled ?? false,
		baseUrl: settings?.baseUrl ?? null,
		model: settings?.model ?? null,
		autopilotEnabled: settings?.autopilotEnabled ?? false,
		autopilotFollowupMinutes: settings?.autopilotFollowupMinutes ?? 15,
		autopilotMaxUpdates: settings?.autopilotMaxUpdates ?? 6,
		autopilotAdvanceStatus: settings?.autopilotAdvanceStatus ?? false,
		autopilotDegradedIncidents: settings?.autopilotDegradedIncidents ?? false,
		apiKeySet: Boolean(settings?.apiKey),
		apiKeyPreview: settings?.apiKey ? `••••••${settings.apiKey.slice(-4)}` : null,
		createdAt: settings?.createdAt ?? null,
		updatedAt: settings?.updatedAt ?? null,
	};
}

const settingsRoutes = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
settingsRoutes.use('*', requireAuth);

settingsRoutes.get('/ai', async (context) => {
	const [settings] = await getDb(context.env).select().from(aiSettings).where(eq(aiSettings.id, 1)).limit(1);
	return context.json({ settings: publicAiSettings(settings) });
});

settingsRoutes.put('/ai', async (context) => {
	let body: unknown;
	try {
		body = await context.req.json();
	} catch {
		return context.json({ message: 'Invalid request body' }, 400);
	}
	const input = parseAiInput(body);
	if (typeof input === 'string') return context.json({ message: input }, 400);

	const db = getDb(context.env);
	const [existing] = await db.select().from(aiSettings).where(eq(aiSettings.id, 1)).limit(1);
	const apiKey = input.apiKey === undefined ? (existing?.apiKey ?? null) : input.apiKey || null;
	if (input.enabled && !input.baseUrl) return context.json({ message: 'A base URL is required when AI messages are enabled' }, 400);
	if (input.enabled && !input.model) return context.json({ message: 'A model is required when AI messages are enabled' }, 400);
	if (input.enabled && !apiKey) return context.json({ message: 'An API key is required when AI messages are enabled' }, 400);

	const now = new Date();
	const autopilot = {
		autopilotEnabled: input.autopilotEnabled,
		autopilotFollowupMinutes: input.autopilotFollowupMinutes,
		autopilotMaxUpdates: input.autopilotMaxUpdates,
		autopilotAdvanceStatus: input.autopilotAdvanceStatus,
		autopilotDegradedIncidents: input.autopilotDegradedIncidents,
	};
	const [settings] = await db
		.insert(aiSettings)
		.values({
			id: 1,
			enabled: input.enabled,
			baseUrl: input.baseUrl,
			apiKey,
			model: input.model,
			...autopilot,
			createdAt: now,
			updatedAt: now,
		})
		.onConflictDoUpdate({
			target: aiSettings.id,
			set: { enabled: input.enabled, baseUrl: input.baseUrl, apiKey, model: input.model, ...autopilot, updatedAt: now },
		})
		.returning();
	return context.json({ settings: publicAiSettings(settings) });
});

settingsRoutes.post('/ai/test', async (context) => {
	const [settings] = await getDb(context.env).select().from(aiSettings).where(eq(aiSettings.id, 1)).limit(1);
	if (!settings?.baseUrl || !settings.apiKey || !settings.model) {
		return context.json({ message: 'Save a base URL, API key, and model first' }, 400);
	}
	const result = await requestCompletionDetailed(
		{ baseUrl: settings.baseUrl, apiKey: settings.apiKey, model: settings.model },
		INCIDENT_MESSAGE_SYSTEM_PROMPT,
		SAMPLE_INCIDENT_CONTEXT,
	);
	const message = result.content ? sanitizeIncidentMessage(result.content) : null;
	await recordAiEvent(context.env, {
		kind: 'settings_test',
		model: settings.model,
		outcome: message ? 'ok' : result.failure ? 'failed' : 'rejected',
		reason: result.failure ?? (message ? null : 'sanitizer_rejected'),
		latencyMs: result.latencyMs,
		promptTokens: result.promptTokens,
		completionTokens: result.completionTokens,
		contextPreview: SAMPLE_INCIDENT_CONTEXT,
		outputPreview: result.content,
	});
	if (!message) return context.json({ message: 'AI message generation failed' }, 502);
	return context.json({ ok: true, message });
});

settingsRoutes.get('/ai/events', async (context) => {
	const rawLimit = Number(context.req.query('limit') ?? 50);
	const limit = Number.isSafeInteger(rawLimit) ? Math.min(100, Math.max(1, rawLimit)) : 50;
	const db = getDb(context.env);
	const events = await db.select().from(aiEvents).orderBy(desc(aiEvents.createdAt)).limit(limit);
	const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
	const [summary] = await db
		.select({
			total: sql<number>`count(*)`,
			ok: sql<number>`coalesce(sum(case when ${aiEvents.outcome} = 'ok' then 1 else 0 end), 0)`,
			averageLatencyMs: sql<number | null>`round(avg(${aiEvents.latencyMs}))`,
			promptTokens: sql<number>`coalesce(sum(${aiEvents.promptTokens}), 0)`,
			completionTokens: sql<number>`coalesce(sum(${aiEvents.completionTokens}), 0)`,
		})
		.from(aiEvents)
		.where(gte(aiEvents.createdAt, since));
	return context.json({
		events: events.map((event) => ({ ...event, createdAt: event.createdAt.toISOString() })),
		summary: {
			total: Number(summary?.total ?? 0),
			ok: Number(summary?.ok ?? 0),
			averageLatencyMs: summary?.averageLatencyMs === null ? null : Number(summary?.averageLatencyMs ?? 0),
			promptTokens: Number(summary?.promptTokens ?? 0),
			completionTokens: Number(summary?.completionTokens ?? 0),
		},
	});
});

export default settingsRoutes;
