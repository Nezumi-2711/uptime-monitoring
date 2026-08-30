import type { Provider, UrlConfig } from './types';
import { eventColor, eventLabel, parseSafeUrl, secretPreview } from './types';

export const slackProvider: Provider<UrlConfig> = {
	parseConfig: parseSafeUrl,
	maskConfig: (config) => ({ url: secretPreview(config.url), configSet: true }),
	format(config, event) {
		const fields = [
			event.monitor ? { type: 'mrkdwn', text: `*Service*\n${event.monitor.name}` } : null,
			event.monitor ? { type: 'mrkdwn', text: `*URL*\n${event.monitor.url}` } : null,
			event.statusCode !== null ? { type: 'mrkdwn', text: `*Status code*\n${event.statusCode}` } : null,
			{ type: 'mrkdwn', text: `*Time*\n${event.at.toISOString()}` },
		].filter(Boolean);
		return {
			url: config.url,
			headers: { 'Content-Type': 'application/json', 'User-Agent': 'Upwatch/1.0 (+notification)' },
			body: JSON.stringify({
				attachments: [
					{
						color: eventColor(event.kind),
						blocks: [
							{ type: 'header', text: { type: 'plain_text', text: `${eventLabel(event.kind)} · ${event.monitor?.name ?? 'Upwatch'}` } },
							{ type: 'section', text: { type: 'mrkdwn', text: event.body ?? event.title }, fields },
							...(event.error ? [{ type: 'context', elements: [{ type: 'mrkdwn', text: `Error: ${event.error}` }] }] : []),
						],
					},
				],
			}),
		};
	},
};
