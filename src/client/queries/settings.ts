import { useMutation, useQuery } from '@tanstack/react-query';
import {
	getNotificationSettings,
	testNotificationWebhook,
	updateNotificationSettings,
	type NotificationSettingsInput,
} from '../api/settings';
import { queryClient } from '../lib/query-client';

export const settingsKeys = {
	all: ['settings'] as const,
	notifications: () => [...settingsKeys.all, 'notifications'] as const,
};

export function useNotificationSettingsQuery() {
	return useQuery({
		queryKey: settingsKeys.notifications(),
		queryFn: ({ signal }) => getNotificationSettings(signal),
	});
}

export function useUpdateNotificationSettingsMutation() {
	return useMutation({
		mutationFn: (input: NotificationSettingsInput) => updateNotificationSettings(input),
		onSuccess: (data) => queryClient.setQueryData(settingsKeys.notifications(), data),
	});
}

export function useTestNotificationWebhookMutation() {
	return useMutation({ mutationFn: testNotificationWebhook });
}
