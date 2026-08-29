import { useMutation, useQuery } from '@tanstack/react-query';
import {
	getAiSettings,
	getNotificationSettings,
	testAiSettings,
	testNotificationWebhook,
	updateAiSettings,
	updateNotificationSettings,
	type AiSettingsInput,
	type NotificationSettingsInput,
} from '../api/settings';
import { queryClient } from '../lib/query-client';

export const settingsKeys = {
	all: ['settings'] as const,
	notifications: () => [...settingsKeys.all, 'notifications'] as const,
	ai: () => [...settingsKeys.all, 'ai'] as const,
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

export function useAiSettingsQuery() {
	return useQuery({
		queryKey: settingsKeys.ai(),
		queryFn: ({ signal }) => getAiSettings(signal),
	});
}

export function useUpdateAiSettingsMutation() {
	return useMutation({
		mutationFn: (input: AiSettingsInput) => updateAiSettings(input),
		onSuccess: (data) => queryClient.setQueryData(settingsKeys.ai(), data),
	});
}

export function useTestAiSettingsMutation() {
	return useMutation({ mutationFn: testAiSettings });
}
