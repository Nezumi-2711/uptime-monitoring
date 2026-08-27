import { queryOptions, useMutation, useQuery } from "@tanstack/react-query";
import {
	createMonitor,
	deleteMonitor,
	listMonitors,
	runMonitorCheck,
	updateMonitor,
	type MonitorInput,
} from "../api/monitors";
import { queryClient } from "../lib/query-client";

export const monitorKeys = {
	all: ["monitors"] as const,
	list: () => [...monitorKeys.all, "list"] as const,
};

export const monitorsQueryOptions = () =>
	queryOptions({
		queryKey: monitorKeys.list(),
		queryFn: ({ signal }) => listMonitors(signal),
		refetchInterval: 60_000,
		refetchIntervalInBackground: false,
	});

export function useMonitorsQuery() {
	return useQuery(monitorsQueryOptions());
}

function invalidateMonitors() {
	return queryClient.invalidateQueries({ queryKey: monitorKeys.all });
}

export function useCreateMonitorMutation() {
	return useMutation({
		mutationFn: (input: MonitorInput) => createMonitor(input),
		onSuccess: invalidateMonitors,
	});
}

export function useUpdateMonitorMutation() {
	return useMutation({
		mutationFn: ({ id, input }: { id: number; input: Partial<MonitorInput> }) =>
			updateMonitor(id, input),
		onSuccess: invalidateMonitors,
	});
}

export function useDeleteMonitorMutation() {
	return useMutation({
		mutationFn: (id: number) => deleteMonitor(id),
		onSuccess: invalidateMonitors,
	});
}

export function useRunCheckMutation() {
	return useMutation({
		mutationFn: (id: number) => runMonitorCheck(id),
		onSuccess: invalidateMonitors,
	});
}
