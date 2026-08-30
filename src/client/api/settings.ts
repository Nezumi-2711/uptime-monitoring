import { getJson, postJson, putJson } from './http';

export type AiSettings = {
	id: number;
	enabled: boolean;
	baseUrl: string | null;
	model: string | null;
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
