import { deleteJson, getJson, patchJson, postJson } from "./http";

export type MonitorMethod = "GET" | "HEAD" | "POST";

export type Monitor = {
	id: number;
	name: string;
	url: string;
	method: MonitorMethod;
	expectedStatus: number;
	intervalSeconds: number;
	timeoutMs: number;
	enabled: boolean;
	lastOk: boolean | null;
	lastStatusCode: number | null;
	lastLatencyMs: number | null;
	lastError: string | null;
	lastCheckedAt: string | null;
	createdAt: string;
	updatedAt: string;
};

export type MonitorInput = {
	name: string;
	url: string;
	method: MonitorMethod;
	expectedStatus: number;
	intervalSeconds: number;
	timeoutMs: number;
	enabled?: boolean;
};

export type CheckResult = {
	ok: boolean;
	statusCode: number | null;
	latencyMs: number;
	error: string | null;
};

export function listMonitors(signal?: AbortSignal) {
	return getJson<{ monitors: Monitor[] }>("/api/monitors", {
		signal,
		credentials: "same-origin",
	});
}

export function createMonitor(input: MonitorInput) {
	return postJson<{ monitor: Monitor }>("/api/monitors", input);
}

export function updateMonitor(id: number, input: Partial<MonitorInput>) {
	return patchJson<{ monitor: Monitor }>(`/api/monitors/${id}`, input);
}

export function deleteMonitor(id: number) {
	return deleteJson<{ ok: true }>(`/api/monitors/${id}`);
}

export function runMonitorCheck(id: number) {
	return postJson<{ result: CheckResult; monitor: Monitor }>(`/api/monitors/${id}/check`);
}
