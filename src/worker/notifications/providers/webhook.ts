import type { NotificationEvent, Provider, UrlConfig } from './types';
import { parseSafeUrl, secretPreview } from './types';

export const webhookProvider: Provider<UrlConfig> = {
	parseConfig: parseSafeUrl,
	maskConfig: (config) => ({ url: secretPreview(config.url), configSet: true }),
	format(config, event) {
		return {
			url: config.url,
			headers: { 'Content-Type': 'application/json', 'User-Agent': 'Upwatch/1.0 (+incident webhook)' },
			body: JSON.stringify({
				event: event.kind === 'manual_opened' ? 'down' : event.kind === 'manual_update' ? 'down' : event.kind,
				monitor: event.monitor ?? { id: 0, name: 'Upwatch test', url: 'https://example.com/health' },
				statusCode: event.statusCode,
				error: event.error,
				at: event.at.toISOString(),
			}),
		};
	},
};

export function formatLegacyWebhook(config: UrlConfig, event: NotificationEvent) {
	return webhookProvider.format(config, event);
}
