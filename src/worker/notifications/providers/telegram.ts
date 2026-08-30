import type { Provider, TelegramConfig } from './types';
import { eventLabel, isRecord, secretPreview } from './types';

function escapeHtml(value: string) {
	return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

export const telegramProvider: Provider<TelegramConfig> = {
	parseConfig(value) {
		if (!isRecord(value)) return 'Invalid Telegram configuration';
		const botToken = typeof value.botToken === 'string' ? value.botToken.trim() : '';
		const chatId = typeof value.chatId === 'string' ? value.chatId.trim() : '';
		if (!botToken || !/^[\w-]+:[\w-]+$/.test(botToken)) return 'Enter a valid Telegram bot token';
		if (!chatId || chatId.length > 100) return 'Enter a valid Telegram chat ID';
		return { botToken, chatId };
	},
	maskConfig: (config) => ({ botToken: secretPreview(config.botToken), chatId: config.chatId, configSet: true }),
	format(config, event) {
		const lines = [
			`<b>${escapeHtml(eventLabel(event.kind))}</b>`,
			`<b>${escapeHtml(event.monitor?.name ?? event.title)}</b>`,
			event.monitor ? escapeHtml(event.monitor.url) : null,
			event.body ? escapeHtml(event.body) : null,
			event.statusCode !== null ? `Status: <code>${event.statusCode}</code>` : null,
			event.error ? `Error: <code>${escapeHtml(event.error)}</code>` : null,
			escapeHtml(event.at.toISOString()),
		].filter(Boolean);
		return {
			url: `https://api.telegram.org/bot${config.botToken}/sendMessage`,
			headers: { 'Content-Type': 'application/json', 'User-Agent': 'Upwatch/1.0 (+notification)' },
			body: JSON.stringify({ chat_id: config.chatId, text: lines.join('\n'), parse_mode: 'HTML', disable_web_page_preview: true }),
		};
	},
};
