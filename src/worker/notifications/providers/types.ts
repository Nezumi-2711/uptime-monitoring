import { isSafeRemoteUrl } from '../../lib/safe-url';

export const CHANNEL_TYPES = ['slack', 'discord', 'telegram', 'webhook'] as const;
export type ChannelType = (typeof CHANNEL_TYPES)[number];

export type UrlConfig = { url: string };
export type TelegramConfig = { botToken: string; chatId: string };
export type ChannelConfig = UrlConfig | TelegramConfig;

export type NotificationEvent = {
	kind: 'down' | 'recovered' | 'degraded' | 'recovered_degraded' | 'manual_opened' | 'manual_update' | 'test';
	monitor: { id: number; name: string; url: string } | null;
	incidentId: number | null;
	title: string;
	body: string | null;
	statusCode: number | null;
	error: string | null;
	at: Date;
};

export type OutboundRequest = { url: string; headers: Record<string, string>; body: string };

export type Provider<TConfig extends ChannelConfig> = {
	parseConfig(value: unknown): TConfig | string;
	maskConfig(config: TConfig): Record<string, unknown>;
	format(config: TConfig, event: NotificationEvent): OutboundRequest;
};

export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseSafeUrl(value: unknown): UrlConfig | string {
	if (!isRecord(value) || typeof value.url !== 'string') return 'A URL is required';
	try {
		const url = new URL(value.url.trim());
		if (!isSafeRemoteUrl(url)) throw new Error('unsafe URL');
		return { url: url.toString() };
	} catch {
		return 'Enter a valid public http or https URL';
	}
}

export function secretPreview(value: string) {
	return `••••••${value.slice(-4)}`;
}

export function eventLabel(kind: NotificationEvent['kind']) {
	return {
		down: 'Service down',
		recovered: 'Service recovered',
		degraded: 'Service degraded',
		recovered_degraded: 'Performance recovered',
		manual_opened: 'Incident opened',
		manual_update: 'Incident update',
		test: 'Test notification',
	}[kind];
}

export function eventColor(kind: NotificationEvent['kind']) {
	if (kind === 'down' || kind === 'manual_opened') return '#dc2626';
	if (kind === 'recovered' || kind === 'recovered_degraded') return '#16a34a';
	if (kind === 'degraded') return '#d97706';
	return '#2563eb';
}
