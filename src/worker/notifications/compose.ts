import type { CheckResult, Monitor } from '../checks/run-check';
import type { AlertTransition, LatencyTransition } from '../checks/persist-result';
import type { NotificationEvent } from './providers';

type MonitorIdentity = Pick<Monitor, 'id' | 'name' | 'url'>;

export function buildAlertEvent(
	monitor: MonitorIdentity,
	result: CheckResult,
	transition: AlertTransition | LatencyTransition,
	checkedAt: Date,
): NotificationEvent {
	if (transition === 'opened' || transition === 'resolved') {
		const opened = transition === 'opened';
		return {
			monitor,
			kind: opened ? 'down' : 'recovered',
			incidentId: null,
			title: opened ? `${monitor.name} is down` : `${monitor.name} recovered`,
			body: result.error,
			statusCode: result.statusCode,
			error: result.error,
			at: checkedAt,
		};
	}
	const degraded = transition === 'degraded';
	return {
		monitor,
		kind: degraded ? 'degraded' : 'recovered_degraded',
		incidentId: null,
		title: degraded ? `${monitor.name} performance degraded` : `${monitor.name} performance recovered`,
		body: degraded ? `Response time was ${result.latencyMs} ms.` : 'Response time returned to normal.',
		statusCode: result.statusCode,
		error: result.error,
		at: checkedAt,
	};
}
