import { queryOptions, useMutation, useQuery } from '@tanstack/react-query';
import { getSession, login, logout, type LoginInput, type SessionResponse } from '../api/auth';
import { queryClient } from '../lib/query-client';

export const authKeys = {
	all: ['auth'] as const,
	session: () => [...authKeys.all, 'session'] as const,
};

export const sessionQueryOptions = () =>
	queryOptions({
		queryKey: authKeys.session(),
		queryFn: ({ signal }) => getSession(signal),
		staleTime: 60_000,
		retry: false,
	});

export function useSessionQuery() {
	return useQuery(sessionQueryOptions());
}

export function useLoginMutation() {
	return useMutation({
		mutationFn: (input: LoginInput) => login(input),
		onSuccess: (session) => {
			queryClient.setQueryData(authKeys.session(), session);
		},
	});
}

export function useLogoutMutation() {
	return useMutation({
		mutationFn: logout,
		onSuccess: () => {
			queryClient.setQueryData<SessionResponse>(authKeys.session(), { authenticated: false });
		},
	});
}
