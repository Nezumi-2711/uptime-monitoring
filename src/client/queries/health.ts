import { queryOptions, useQuery } from '@tanstack/react-query';
import { getHealth } from '../api/health';

export const healthKeys = {
	all: ['health'] as const,
	status: () => [...healthKeys.all, 'status'] as const,
};

export const healthQueryOptions = () =>
	queryOptions({
		queryKey: healthKeys.status(),
		queryFn: ({ signal }) => getHealth(signal),
		staleTime: 30_000,
		refetchInterval: 5 * 60_000,
		refetchIntervalInBackground: false,
	});

export function useHealthQuery() {
	return useQuery(healthQueryOptions());
}
