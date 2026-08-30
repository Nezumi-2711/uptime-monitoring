import type { Monitor } from '../api/monitors';

export function monitorState(
	monitor: Pick<Monitor, 'lastOk' | 'lastDegraded' | 'degradedLatencyMs' | 'consecutiveFailures' | 'failureThreshold'>,
) {
	if (monitor.lastOk === false) return { label: 'Down', variant: 'offline' as const, detail: null };
	if (monitor.consecutiveFailures > 0) {
		return {
			label: 'Failing',
			variant: 'pending' as const,
			detail: `${monitor.consecutiveFailures} of ${monitor.failureThreshold} failed checks — an incident opens if the next check fails`,
		};
	}
	if (monitor.lastDegraded) {
		return {
			label: 'Degraded',
			variant: 'pending' as const,
			detail:
				monitor.degradedLatencyMs === null
					? 'Response time is above the configured threshold'
					: `Response time exceeds ${monitor.degradedLatencyMs} ms`,
		};
	}
	if (monitor.lastOk === true) return { label: 'Up', variant: 'online' as const, detail: null };
	return { label: 'Not checked', variant: 'checking' as const, detail: null };
}
