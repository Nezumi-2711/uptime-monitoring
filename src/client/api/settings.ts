import { getJson, postJson, putJson } from './http';

export type NotificationSettings = {
	id: number;
	webhookUrl: string | null;
	webhookEnabled: boolean;
	createdAt: string | null;
	updatedAt: string | null;
};

export type NotificationSettingsInput = Pick<NotificationSettings, 'webhookUrl' | 'webhookEnabled'>;

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

export function getNotificationSettings(signal?: AbortSignal) {
	return getJson<{ settings: NotificationSettings }>('/api/settings/notifications', {
		signal,
		credentials: 'same-origin',
	});
}

export function updateNotificationSettings(input: NotificationSettingsInput) {
	return putJson<{ settings: NotificationSettings }>('/api/settings/notifications', input);
}

export function testNotificationWebhook() {
	return postJson<{ ok: true }>('/api/settings/notifications/test');
}

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
