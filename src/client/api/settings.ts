import { getJson, postJson, putJson } from './http';

export type AiSettings = {
	id: number;
	enabled: boolean;
	baseUrl: string | null;
	model: string | null;
	autopilotEnabled: boolean;
	autopilotFollowupMinutes: number;
	autopilotMaxUpdates: number;
	autopilotAdvanceStatus: boolean;
	autopilotDegradedIncidents: boolean;
	apiKeySet: boolean;
	apiKeyPreview: string | null;
	createdAt: string | null;
	updatedAt: string | null;
};

export type AiSettingsInput = {
	enabled: boolean;
	baseUrl: string | null;
	model: string | null;
	apiKey?: string | null;
	autopilotEnabled: boolean;
	autopilotFollowupMinutes: number;
	autopilotMaxUpdates: number;
	autopilotAdvanceStatus: boolean;
	autopilotDegradedIncidents: boolean;
};

export type AiEvent = {
	id: number;
	kind: string;
	incidentId: number | null;
	monitorId: number | null;
	model: string | null;
	outcome: string;
	reason: string | null;
	latencyMs: number | null;
	promptTokens: number | null;
	completionTokens: number | null;
	contextPreview: string | null;
	outputPreview: string | null;
	createdAt: string;
};

export type AiEventSummary = {
	total: number;
	ok: number;
	averageLatencyMs: number | null;
	promptTokens: number;
	completionTokens: number;
};

export function getAiSettings(signal?: AbortSignal) {
	return getJson<{ settings: AiSettings }>('/api/settings/ai', {
		signal,
		credentials: 'same-origin',
	});
}

export function updateAiSettings(input: AiSettingsInput) {
	return putJson<{ settings: AiSettings }>('/api/settings/ai', input);
}

export function testAiSettings() {
	return postJson<{ ok: true; message: string }>('/api/settings/ai/test');
}

export function getAiEvents(signal?: AbortSignal) {
	return getJson<{ events: AiEvent[]; summary: AiEventSummary }>('/api/settings/ai/events?limit=50', {
		signal,
		credentials: 'same-origin',
	});
}
