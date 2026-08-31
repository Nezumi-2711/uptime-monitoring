import { useMutation, useQuery } from '@tanstack/react-query';
import { getAiEvents, getAiSettings, testAiSettings, updateAiSettings, type AiSettingsInput } from '../api/settings';
import { queryClient } from '../lib/query-client';

export const settingsKeys = {
	all: ['settings'] as const,
	ai: () => [...settingsKeys.all, 'ai'] as const,
	aiEvents: () => [...settingsKeys.all, 'ai-events'] as const,
};

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

export function useAiEventsQuery() {
	return useQuery({
		queryKey: settingsKeys.aiEvents(),
		queryFn: ({ signal }) => getAiEvents(signal),
	});
}
