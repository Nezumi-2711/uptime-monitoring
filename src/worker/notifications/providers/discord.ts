import type { Provider, UrlConfig } from './types';
import { eventColor, eventLabel, parseSafeUrl, secretPreview } from './types';

export const discordProvider: Provider<UrlConfig> = {
	parseConfig: parseSafeUrl,
	maskConfig: (config) => ({ url: secretPreview(config.url), configSet: true }),
	format(config, event) {
		const fields = [
			event.monitor ? { name: 'Service', value: event.monitor.name, inline: true } : null,
			event.statusCode !== null ? { name: 'Status code', value: String(event.statusCode), inline: true } : null,
			event.error ? { name: 'Error', value: event.error.slice(0, 1024), inline: false } : null,
		].filter(Boolean);
		return {
			url: config.url,
			headers: { 'Content-Type': 'application/json', 'User-Agent': 'Upwatch/1.0 (+notification)' },
			body: JSON.stringify({
				embeds: [
					{
						title: `${eventLabel(event.kind)} · ${event.monitor?.name ?? 'Upwatch'}`,
						...(event.monitor ? { url: event.monitor.url } : {}),
						description: event.body ?? event.title,
						color: Number.parseInt(eventColor(event.kind).slice(1), 16),
						fields,
						timestamp: event.at.toISOString(),
					},
				],
			}),
		};
	},
};
