import { getJson } from './http';

export type PublicServiceStatus = 'up' | 'down' | 'unknown';
export type PublicOverallStatus = 'operational' | 'degraded' | 'down';

export type PublicService = {
	id: number;
	name: string;
	status: PublicServiceStatus;
	message: string | null;
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
};

export function getStatus(signal?: AbortSignal) {
	return getJson<PublicStatus>('/api/status', { signal });
}
