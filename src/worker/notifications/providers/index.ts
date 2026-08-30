import { discordProvider } from './discord';
import { slackProvider } from './slack';
import { telegramProvider } from './telegram';
import type { ChannelConfig, ChannelType, NotificationEvent, OutboundRequest } from './types';
import { webhookProvider } from './webhook';

export * from './types';
export { discordProvider, slackProvider, telegramProvider, webhookProvider };

export function parseChannelConfig(type: ChannelType, value: unknown): ChannelConfig | string {
	if (type === 'telegram') return telegramProvider.parseConfig(value);
	return ({ slack: slackProvider, discord: discordProvider, webhook: webhookProvider } as const)[type].parseConfig(value);
}

export function maskChannelConfig(type: ChannelType, config: ChannelConfig) {
	if (type === 'telegram') return telegramProvider.maskConfig(config as { botToken: string; chatId: string });
	return ({ slack: slackProvider, discord: discordProvider, webhook: webhookProvider } as const)[type].maskConfig(
		config as { url: string },
	);
}

export function formatChannel(type: ChannelType, config: ChannelConfig, event: NotificationEvent): OutboundRequest {
	if (type === 'telegram') return telegramProvider.format(config as { botToken: string; chatId: string }, event);
	return ({ slack: slackProvider, discord: discordProvider, webhook: webhookProvider } as const)[type].format(
		config as { url: string },
		event,
	);
}
