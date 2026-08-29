import { deleteJson, getJson, patchJson, postJson } from './http';

export type MonitorMethod = 'GET' | 'HEAD' | 'POST';

export type Monitor = {
	id: number;
	name: string;
	url: string;
	method: MonitorMethod;
	expectedStatus: number;
	intervalSeconds: number;
	timeoutMs: number;
	enabled: boolean;
	alertsEnabled: boolean;
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
	alertsEnabled?: boolean;
};

export type CheckResult = {
	ok: boolean;
	statusCode: number | null;
	latencyMs: number;
	error: string | null;
};

export type Check = CheckResult & {
	id: number;
	monitorId: number;
	checkedAt: string;
};

export type Incident = {
	id: number;
	monitorId: number;
	startedAt: string;
	resolvedAt: string | null;
	startStatusCode: number | null;
	startError: string | null;
	aiMessage: string | null;
	durationMs: number | null;
	createdAt: string;
	updatedAt: string;
};

export type StatsWindow = {
	uptimePct: number | null;
	totalChecks: number;
	upChecks: number;
	avgLatencyMs: number | null;
	incidentCount: number;
};

export type MonitorStats = {
	windows: Record<'24h' | '7d' | '30d' | '90d', StatsWindow>;
};

export function listMonitors(signal?: AbortSignal) {
	return getJson<{ monitors: Monitor[] }>('/api/monitors', {
		signal,
		credentials: 'same-origin',
	});
}

export function getMonitor(id: number, signal?: AbortSignal) {
	return getJson<{ monitor: Monitor }>(`/api/monitors/${id}`, { signal, credentials: 'same-origin' });
}

export function listChecks(id: number, limit = 100, signal?: AbortSignal) {
	return getJson<{ checks: Check[] }>(`/api/monitors/${id}/checks?limit=${limit}`, { signal, credentials: 'same-origin' });
}

export function getMonitorStats(id: number, signal?: AbortSignal) {
	return getJson<MonitorStats>(`/api/monitors/${id}/stats`, { signal, credentials: 'same-origin' });
}

export function listIncidents(id: number, limit = 50, signal?: AbortSignal) {
	return getJson<{ incidents: Incident[] }>(`/api/monitors/${id}/incidents?limit=${limit}`, { signal, credentials: 'same-origin' });
}

export function createMonitor(input: MonitorInput) {
	return postJson<{ monitor: Monitor }>('/api/monitors', input);
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
