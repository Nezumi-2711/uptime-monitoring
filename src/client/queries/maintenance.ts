import { useMutation, useQuery } from '@tanstack/react-query';
import {
	createMaintenanceWindow,
	deleteMaintenanceWindow,
	getMaintenanceWindows,
	updateMaintenanceWindow,
	type MaintenanceWindowInput,
} from '../api/maintenance';
import { queryClient } from '../lib/query-client';

export const maintenanceKeys = { all: ['maintenance'] as const };

export function useMaintenanceWindowsQuery() {
	return useQuery({
		queryKey: maintenanceKeys.all,
		queryFn: ({ signal }) => getMaintenanceWindows(signal),
		refetchInterval: 60_000,
		refetchIntervalInBackground: false,
	});
}

function invalidateMaintenance() {
	return queryClient.invalidateQueries({ queryKey: maintenanceKeys.all });
}

export function useCreateMaintenanceWindowMutation() {
	return useMutation({ mutationFn: (input: MaintenanceWindowInput) => createMaintenanceWindow(input), onSuccess: invalidateMaintenance });
}

export function useUpdateMaintenanceWindowMutation() {
	return useMutation({
		mutationFn: ({ id, input }: { id: number; input: Partial<MaintenanceWindowInput> }) => updateMaintenanceWindow(id, input),
		onSuccess: invalidateMaintenance,
	});
}

export function useDeleteMaintenanceWindowMutation() {
	return useMutation({ mutationFn: (id: number) => deleteMaintenanceWindow(id), onSuccess: invalidateMaintenance });
}
