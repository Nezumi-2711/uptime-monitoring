import { getJson } from './http';

export type PublicServiceStatus = 'up' | 'degraded' | 'down' | 'unknown' | 'maintenance';
export type PublicOverallStatus = 'operational' | 'degraded' | 'down';

export type PublicIncidentUpdate = { status: string; body: string; createdAt: string };
export type PublicIncident = {
	id: number;
	title: string;
	status: string;
	impact: string;
	source: string;
	startedAt: string;
	resolvedAt?: string | null;
	durationMs?: number | null;
	latestUpdate?: PublicIncidentUpdate | null;
	services: Array<{ id: number; name: string }>;
	updates?: PublicIncidentUpdate[];
};

export type PublicService = {
	id: number;
	name: string;
	status: PublicServiceStatus;
	message: string | null;
	maintenance: { name: string; endsAt: string } | null;
	lastCheckedAt: string | null;
	uptime90d: number | null;
	history: Array<{
		day: number;
		uptimePct: number | null;
	}>;
};

export type PublicStatus = {
	overall: PublicOverallStatus;
	updatedAt: number;
	services: PublicService[];
	activeIncidents: PublicIncident[];
};

export function getStatus(signal?: AbortSignal) {
	return getJson<PublicStatus>('/api/status', { signal });
}

export function getIncidentHistory(signal?: AbortSignal) {
	return getJson<{ incidents: PublicIncident[] }>('/api/status/incidents', { signal });
}

export function getPublicIncident(id: number, signal?: AbortSignal) {
	return getJson<{ incident: PublicIncident }>(`/api/status/incidents/${id}`, { signal });
}
