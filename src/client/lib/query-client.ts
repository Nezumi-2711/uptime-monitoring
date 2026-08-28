import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { ApiError } from '../api/http';
import type { SessionResponse } from '../api/auth';

const sessionQueryKey = ['auth', 'session'] as const;

function handleAuthError(error: unknown) {
	if (error instanceof ApiError && error.status === 401) {
		queryClient.setQueryData<SessionResponse>(sessionQueryKey, {
			authenticated: false,
		});
	}
}

export const queryClient: QueryClient = new QueryClient({
	queryCache: new QueryCache({ onError: handleAuthError }),
	mutationCache: new MutationCache({ onError: handleAuthError }),
	defaultOptions: {
		queries: {
			retry: 1,
			refetchOnWindowFocus: false,
		},
	},
});
