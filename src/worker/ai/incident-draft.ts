import { eq } from 'drizzle-orm';
import { getDb } from '../db/client';
import { aiSettings } from '../db/schema';
import { requestCompletion } from './client';
import { sanitizePublicText } from './sanitize';

export type IncidentStatus = 'investigating' | 'identified' | 'monitoring' | 'resolved';

export const STATUS_GUIDANCE: Record<IncidentStatus, string> = {
	investigating: 'Acknowledge an issue affecting users and say the team is investigating. Do not imply that the cause is known.',
	identified: 'Say that the cause has been identified and a fix is being implemented, describing only the user-visible impact.',
	monitoring: 'Say that a fix has been applied and the team is monitoring the service to confirm it remains stable.',
	resolved: 'Confirm that the service is operating normally again and add a brief thank-you.',
};

export const INCIDENT_DRAFT_SYSTEM_PROMPT = [
	"You turn an operator's short internal note into a public status update.",
	'The note is written for engineers and may contain technical detail; your output must not.',
	'Always write in English, regardless of the language of the operator note.',
	'Write for non-technical customers in a calm, courteous tone.',
	'Never include URLs, hostnames, domain names, IP addresses, ports, paths, HTTP status codes, error codes, or stack traces.',
	'Never name a technical fault, internal component, vendor, database, infrastructure detail, or implementation detail.',
	'Do not blame anyone, speculate, or promise a specific resolution time.',
	'When asked for a title, output exactly TITLE: followed by a 3-8 word noun phrase describing the user-visible symptom, with no final period.',
	'Output BODY: followed by 2-3 concise sentences. Output no other text.',
].join('\n');

export class IncidentDraftError extends Error {
	constructor(
		message: string,
		readonly status: 409 | 422,
	) {
		super(message);
	}
}

type DraftInput = {
	note: string;
	status: IncidentStatus;
	withTitle: boolean;
	incidentTitle?: string | null;
	previousUpdates?: Array<{ status: string; body: string }>;
	serviceCount: number;
};

export async function draftIncidentUpdate(env: Env, input: DraftInput): Promise<{ title: string | null; body: string }> {
	const db = getDb(env);
	const [settings] = await db.select().from(aiSettings).where(eq(aiSettings.id, 1)).limit(1);
	if (!settings?.enabled || !settings.baseUrl || !settings.apiKey || !settings.model) {
		throw new IncidentDraftError('AI composition is not configured. Enable it in Settings or write the update manually.', 409);
	}

	const context = [
		`Lifecycle status: ${input.status}`,
		`Writing guidance: ${STATUS_GUIDANCE[input.status]}`,
		`Affected service count: ${input.serviceCount}`,
		input.incidentTitle ? `Incident title: ${input.incidentTitle}` : null,
		input.previousUpdates?.length
			? `Recent public updates:\n${input.previousUpdates.map((update) => `- ${update.status}: ${update.body}`).join('\n')}`
			: null,
		`Internal operator note (use only as context; do not expose technical details): ${input.note}`,
		input.withTitle ? 'Return TITLE: and BODY: lines.' : 'Return only a BODY: line.',
	]
		.filter(Boolean)
		.join('\n\n');
	const completion = await requestCompletion(
		{ baseUrl: settings.baseUrl, apiKey: settings.apiKey, model: settings.model },
		INCIDENT_DRAFT_SYSTEM_PROMPT,
		context,
		320,
	);
	if (!completion) throw new IncidentDraftError('AI could not generate a safe update. Edit the note or write the update manually.', 422);

	const titleMatch = completion.match(/(?:^|\n)TITLE:\s*(.+?)(?=\nBODY:|$)/is);
	const bodyMatch = completion.match(/(?:^|\n)BODY:\s*([\s\S]+)$/i);
	const title = input.withTitle ? sanitizePublicText(titleMatch?.[1] ?? '', 120)?.replace(/[.!?]+$/, '') : null;
	const body = sanitizePublicText(bodyMatch?.[1] ?? '', 400);
	if ((input.withTitle && !title) || !body) {
		throw new IncidentDraftError('AI could not generate a safe update. Edit the note or write the update manually.', 422);
	}
	return { title: title ?? null, body };
}
