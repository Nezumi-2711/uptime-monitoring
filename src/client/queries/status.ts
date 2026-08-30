import { useQuery } from '@tanstack/react-query';
import { getIncidentHistory, getPublicIncident, getStatus } from '../api/status';

export const statusKeys = {
	all: ['public-status'] as const,
	history: ['public-status', 'incidents'] as const,
	incident: (id: number) => ['public-status', 'incidents', id] as const,
};

export function useStatusQuery() {
	return useQuery({
		queryKey: statusKeys.all,
		queryFn: ({ signal }) => getStatus(signal),
		refetchInterval: 60_000,
		refetchIntervalInBackground: false,
	});
}

export function useIncidentHistoryQuery() {
	return useQuery({
		queryKey: statusKeys.history,
		queryFn: ({ signal }) => getIncidentHistory(signal),
		refetchInterval: 60_000,
	});
}

export function usePublicIncidentQuery(id: number) {
	return useQuery({ queryKey: statusKeys.incident(id), queryFn: ({ signal }) => getPublicIncident(id, signal) });
}
