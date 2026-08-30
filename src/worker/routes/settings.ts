import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { requestCompletion } from '../ai/client';
import { SAMPLE_INCIDENT_CONTEXT } from '../ai/incident-context';
import { INCIDENT_MESSAGE_SYSTEM_PROMPT, sanitizeIncidentMessage } from '../ai/incident-message';
import { getDb } from '../db/client';
import { aiSettings } from '../db/schema';
import { requireAuth, type AuthVariables } from '../lib/require-auth';
import { isSafeRemoteUrl } from '../lib/safe-url';

type AiInput = {
	enabled: boolean;
	baseUrl: string | null;
	model: string | null;
	apiKey?: string;
};

function parseAiInput(value: unknown): AiInput | string {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		return 'Invalid request body';
	}
	const body = value as Record<string, unknown>;
	if (typeof body.enabled !== 'boolean') return 'enabled must be a boolean';

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

	return { enabled: body.enabled, baseUrl, model, apiKey };
}

function publicAiSettings(settings: typeof aiSettings.$inferSelect | undefined) {
	return {
		id: 1,
		enabled: settings?.enabled ?? false,
		baseUrl: settings?.baseUrl ?? null,
		model: settings?.model ?? null,
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
	const [settings] = await db
		.insert(aiSettings)
		.values({ id: 1, enabled: input.enabled, baseUrl: input.baseUrl, apiKey, model: input.model, createdAt: now, updatedAt: now })
		.onConflictDoUpdate({
			target: aiSettings.id,
			set: { enabled: input.enabled, baseUrl: input.baseUrl, apiKey, model: input.model, updatedAt: now },
		})
		.returning();
	return context.json({ settings: publicAiSettings(settings) });
});

settingsRoutes.post('/ai/test', async (context) => {
	const [settings] = await getDb(context.env).select().from(aiSettings).where(eq(aiSettings.id, 1)).limit(1);
	if (!settings?.baseUrl || !settings.apiKey || !settings.model) {
		return context.json({ message: 'Save a base URL, API key, and model first' }, 400);
	}
	const content = await requestCompletion(
		{ baseUrl: settings.baseUrl, apiKey: settings.apiKey, model: settings.model },
		INCIDENT_MESSAGE_SYSTEM_PROMPT,
		SAMPLE_INCIDENT_CONTEXT,
	);
	const message = content ? sanitizeIncidentMessage(content) : null;
	if (!message) return context.json({ message: 'AI message generation failed' }, 502);
	return context.json({ ok: true, message });
});

export default settingsRoutes;
