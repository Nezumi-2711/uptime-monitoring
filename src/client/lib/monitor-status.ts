import type { Monitor } from '../api/monitors';

export function monitorState(monitor: Pick<Monitor, 'lastOk' | 'consecutiveFailures' | 'failureThreshold'>) {
	if (monitor.lastOk === false) return { label: 'Down', variant: 'offline' as const, detail: null };
	if (monitor.consecutiveFailures > 0) {
		return {
			label: 'Degrading',
			variant: 'pending' as const,
			detail: `${monitor.consecutiveFailures} of ${monitor.failureThreshold} failed checks — an incident opens if the next check fails`,
		};
	}
	if (monitor.lastOk === true) return { label: 'Up', variant: 'online' as const, detail: null };
	return { label: 'Not checked', variant: 'checking' as const, detail: null };
}
