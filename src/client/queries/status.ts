import { useQuery } from "@tanstack/react-query";
import { getStatus } from "../api/status";

export const statusKeys = {
	all: ["public-status"] as const,
};

export function useStatusQuery() {
	return useQuery({
		queryKey: statusKeys.all,
		queryFn: ({ signal }) => getStatus(signal),
		refetchInterval: 60_000,
		refetchIntervalInBackground: false,
	});
}
