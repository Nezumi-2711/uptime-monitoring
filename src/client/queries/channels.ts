import { useMutation, useQuery } from '@tanstack/react-query';
import {
	createNotificationChannel,
	deleteNotificationChannel,
	getNotificationChannels,
	getNotificationDeliveries,
	testNotificationChannel,
	updateNotificationChannel,
	type NotificationChannelInput,
} from '../api/channels';
import { queryClient } from '../lib/query-client';

export const channelKeys = {
	all: ['channels'] as const,
	deliveries: (id: number) => ['channels', id, 'deliveries'] as const,
};
export function useNotificationChannelsQuery() {
	return useQuery({ queryKey: channelKeys.all, queryFn: ({ signal }) => getNotificationChannels(signal), refetchInterval: 30_000 });
}
function invalidateChannels() {
	return queryClient.invalidateQueries({ queryKey: channelKeys.all });
}
export function useCreateNotificationChannelMutation() {
	return useMutation({ mutationFn: (input: NotificationChannelInput) => createNotificationChannel(input), onSuccess: invalidateChannels });
}
export function useUpdateNotificationChannelMutation() {
	return useMutation({
		mutationFn: ({ id, input }: { id: number; input: Partial<NotificationChannelInput> }) => updateNotificationChannel(id, input),
		onSuccess: invalidateChannels,
	});
}
export function useDeleteNotificationChannelMutation() {
	return useMutation({ mutationFn: deleteNotificationChannel, onSuccess: invalidateChannels });
}
export function useTestNotificationChannelMutation() {
	return useMutation({ mutationFn: testNotificationChannel, onSuccess: invalidateChannels });
}
export function useNotificationDeliveriesQuery(id: number) {
	return useQuery({ queryKey: channelKeys.deliveries(id), queryFn: ({ signal }) => getNotificationDeliveries(id, 20, signal) });
}
