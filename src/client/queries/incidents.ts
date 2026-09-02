import { useMutation, useQuery } from '@tanstack/react-query';
import {
	createIncident,
	deleteIncident,
	draftIncident,
	draftIncidentUpdate,
	getIncident,
	listIncidents,
	postIncidentUpdate,
	updateIncident,
	type IncidentInput,
	type IncidentStatus,
	type IncidentUpdateInput,
} from '../api/incidents';
import { queryClient } from '../lib/query-client';
import { statusKeys } from './status';

export const incidentKeys = {
	all: ['incidents'] as const,
	list: (status: 'open' | 'all') => [...incidentKeys.all, status] as const,
	detail: (id: number) => [...incidentKeys.all, 'detail', id] as const,
};
export function useIncidentsQuery(status: 'open' | 'all' = 'open') {
	return useQuery({
		queryKey: incidentKeys.list(status),
		queryFn: ({ signal }) => listIncidents(status, signal),
		refetchInterval: 120_000,
		refetchIntervalInBackground: false,
	});
}
export function useIncidentQuery(id: number) {
	return useQuery({ queryKey: incidentKeys.detail(id), queryFn: ({ signal }) => getIncident(id, signal) });
}
function invalidateIncidents() {
	void queryClient.invalidateQueries({ queryKey: incidentKeys.all });
	return queryClient.invalidateQueries({ queryKey: statusKeys.all });
}
export function useCreateIncidentMutation() {
	return useMutation({ mutationFn: (input: IncidentInput) => createIncident(input), onSuccess: invalidateIncidents });
}
export function useUpdateIncidentMutation() {
	return useMutation({
		mutationFn: ({ id, input }: { id: number; input: Partial<Pick<IncidentInput, 'title' | 'impact' | 'monitorIds'>> }) =>
			updateIncident(id, input),
		onSuccess: invalidateIncidents,
	});
}
export function usePostIncidentUpdateMutation() {
	return useMutation({
		mutationFn: ({ id, input }: { id: number; input: IncidentUpdateInput }) => postIncidentUpdate(id, input),
		onSuccess: invalidateIncidents,
	});
}
export function useDeleteIncidentMutation() {
	return useMutation({ mutationFn: deleteIncident, onSuccess: invalidateIncidents });
}
export function useDraftIncidentMutation() {
	return useMutation({ mutationFn: (input: { note: string; status: IncidentStatus; monitorIds: number[] }) => draftIncident(input) });
}
export function useDraftIncidentUpdateMutation(id: number) {
	return useMutation({ mutationFn: (input: { note: string; status: IncidentStatus }) => draftIncidentUpdate(id, input) });
}
