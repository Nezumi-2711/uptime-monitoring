import { queryOptions, useMutation, useQuery } from '@tanstack/react-query';
import {
	createMonitor,
	deleteMonitor,
	getMonitor,
	getMonitorStats,
	listChecks,
	listIncidents,
	listMonitors,
	runMonitorCheck,
	updateMonitor,
	type MonitorInput,
} from '../api/monitors';
import { queryClient } from '../lib/query-client';

export const monitorKeys = {
	all: ['monitors'] as const,
	list: () => [...monitorKeys.all, 'list'] as const,
	detail: (id: number) => [...monitorKeys.all, 'detail', id] as const,
	checks: (id: number) => [...monitorKeys.all, 'checks', id] as const,
	stats: (id: number) => [...monitorKeys.all, 'stats', id] as const,
	incidents: (id: number) => [...monitorKeys.all, 'incidents', id] as const,
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

const liveQueryDefaults = {
	refetchInterval: 60_000,
	refetchIntervalInBackground: false,
} as const;

export function useMonitorQuery(id: number) {
	return useQuery({
		queryKey: monitorKeys.detail(id),
		queryFn: ({ signal }) => getMonitor(id, signal),
		enabled: Number.isSafeInteger(id) && id > 0,
		...liveQueryDefaults,
	});
}

export function useMonitorChecksQuery(id: number) {
	return useQuery({
		queryKey: monitorKeys.checks(id),
		queryFn: ({ signal }) => listChecks(id, 100, signal),
		enabled: Number.isSafeInteger(id) && id > 0,
		...liveQueryDefaults,
	});
}

export function useMonitorStatsQuery(id: number) {
	return useQuery({
		queryKey: monitorKeys.stats(id),
		queryFn: ({ signal }) => getMonitorStats(id, signal),
		enabled: Number.isSafeInteger(id) && id > 0,
		...liveQueryDefaults,
	});
}

export function useMonitorIncidentsQuery(id: number) {
	return useQuery({
		queryKey: monitorKeys.incidents(id),
		queryFn: ({ signal }) => listIncidents(id, 50, signal),
		enabled: Number.isSafeInteger(id) && id > 0,
		...liveQueryDefaults,
	});
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
		mutationFn: ({ id, input }: { id: number; input: Partial<MonitorInput> }) => updateMonitor(id, input),
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
