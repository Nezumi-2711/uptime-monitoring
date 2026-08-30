import { deleteJson, getJson, patchJson, postJson } from './http';

export type MonitorMethod = 'GET' | 'HEAD' | 'POST';

export type Monitor = {
	id: number;
	name: string;
	url: string;
	method: MonitorMethod;
	expectedStatus: number;
	expectKeyword: string | null;
	keywordInverted: boolean;
	requestHeaders: string | null;
	requestBody: string | null;
	degradedLatencyMs: number | null;
	intervalSeconds: number;
	timeoutMs: number;
	enabled: boolean;
	alertsEnabled: boolean;
	retryCount: number;
	failureThreshold: number;
	consecutiveFailures: number;
	consecutiveSlow: number;
	lastOk: boolean | null;
	lastDegraded: boolean;
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
	expectKeyword?: string | null;
	keywordInverted?: boolean;
	requestHeaders?: Record<string, string> | null;
	requestBody?: string | null;
	degradedLatencyMs?: number | null;
	intervalSeconds: number;
	timeoutMs: number;
	retryCount?: number;
	failureThreshold?: number;
	enabled?: boolean;
	alertsEnabled?: boolean;
};

export type CheckResult = {
	ok: boolean;
	degraded: boolean;
	statusCode: number | null;
	latencyMs: number;
	error: string | null;
	attempts: number;
};

export type Check = {
	id: number;
	monitorId: number;
	ok: boolean;
	degraded: boolean;
	statusCode: number | null;
	latencyMs: number;
	error: string | null;
	checkedAt: string;
	maintenance: boolean;
};

export type CheckTransition = 'opened' | 'pending' | 'cleared' | 'resolved' | null;
export type LatencyTransition = 'degraded' | 'recovered' | null;

export type Incident = {
	id: number;
	title: string | null;
	status: string;
	impact: string;
	source: string;
	startedAt: string;
	resolvedAt: string | null;
	startStatusCode: number | null;
	startError: string | null;
	latestUpdate: { body: string; status: string; createdAt: number } | null;
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
	return postJson<{ result: CheckResult; transition: CheckTransition; latencyTransition: LatencyTransition; monitor: Monitor }>(
		`/api/monitors/${id}/check`,
	);
}
