import { getJson, postJson, putJson } from "./http";

export type NotificationSettings = {
	id: number;
	webhookUrl: string | null;
	webhookEnabled: boolean;
	createdAt: string | null;
	updatedAt: string | null;
};

export type NotificationSettingsInput = Pick<NotificationSettings, "webhookUrl" | "webhookEnabled">;

export function getNotificationSettings(signal?: AbortSignal) {
	return getJson<{ settings: NotificationSettings }>("/api/settings/notifications", {
		signal,
		credentials: "same-origin",
	});
}

export function updateNotificationSettings(input: NotificationSettingsInput) {
	return putJson<{ settings: NotificationSettings }>("/api/settings/notifications", input);
}

export function testNotificationWebhook() {
	return postJson<{ ok: true }>("/api/settings/notifications/test");
}
