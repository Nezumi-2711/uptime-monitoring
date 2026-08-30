import { deleteJson, getJson, patchJson, postJson } from './http';

export type ChannelType = 'slack' | 'discord' | 'telegram' | 'webhook';
export type ChannelConfigInput = { url: string } | { botToken: string; chatId: string };
export type NotificationDelivery = {
	id: number;
	channelId: number;
	incidentId: number | null;
	monitorId: number | null;
	event: string;
	ok: boolean;
	statusCode: number | null;
	error: string | null;
	attempts: number;
	createdAt: string;
};
export type NotificationChannel = {
	id: number;
	name: string;
	type: ChannelType;
	config: { configSet: boolean; url?: string; botToken?: string; chatId?: string };
	enabled: boolean;
	notifyManual: boolean;
	monitorIds: number[];
	lastDelivery: NotificationDelivery | null;
	createdAt: string;
	updatedAt: string;
};
export type NotificationChannelInput = {
	name: string;
	type: ChannelType;
	config?: ChannelConfigInput;
	enabled: boolean;
	notifyManual: boolean;
	monitorIds: number[];
};

export function getNotificationChannels(signal?: AbortSignal) {
	return getJson<{ channels: NotificationChannel[] }>('/api/channels', { signal, credentials: 'same-origin' });
}
export function createNotificationChannel(input: NotificationChannelInput) {
	return postJson<{ channel: NotificationChannel }>('/api/channels', input);
}
export function updateNotificationChannel(id: number, input: Partial<NotificationChannelInput>) {
	return patchJson<{ channel: NotificationChannel }>(`/api/channels/${id}`, input);
}
export function deleteNotificationChannel(id: number) {
	return deleteJson<{ ok: true }>(`/api/channels/${id}`);
}
export function testNotificationChannel(id: number) {
	return postJson<{ ok: true }>(`/api/channels/${id}/test`);
}
export function getNotificationDeliveries(id: number, limit = 20, signal?: AbortSignal) {
	return getJson<{ deliveries: NotificationDelivery[] }>(`/api/channels/${id}/deliveries?limit=${limit}`, {
		signal,
		credentials: 'same-origin',
	});
}
