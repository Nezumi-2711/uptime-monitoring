import { getJson } from "./http";

export type HealthResponse = {
	ok: boolean;
	db: { ok: number } | null;
	ts: number;
};

export function getHealth(signal?: AbortSignal) {
	return getJson<HealthResponse>("/api/health", { signal });
}
