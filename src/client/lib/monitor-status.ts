import type { Monitor } from '../api/monitors';
import type { PublicService } from '../api/status';

const DAY_MS = 24 * 60 * 60 * 1000;

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

export function uptimeWindows(service: PublicService | undefined) {
	if (!service) return { today: null, d7: null, d30: null };

	const now = new Date();
	const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
	const averageUptime = (days: number) => {
		const values = service.history.flatMap(({ day, uptimePct }) =>
			day >= todayUtc - (days - 1) * DAY_MS && uptimePct !== null ? [uptimePct] : [],
		);
		return values.length ? values.reduce((total, value) => total + value, 0) / values.length : null;
	};

	return {
		today: service.history.find(({ day }) => day === todayUtc)?.uptimePct ?? null,
		d7: averageUptime(7),
		d30: averageUptime(30),
	};
}
