export type AutopilotIncidentStatus = 'investigating' | 'identified' | 'monitoring' | 'resolved';

export type StatusSignal = {
	consecutiveFailures: number;
	failureSignatureStable: boolean;
	consecutiveOk: number;
	latestOk: boolean;
	regressionUsed: boolean;
};

export type ImpactSignal = {
	kind: 'down' | 'degraded';
	affectedMonitors: number;
	totalMonitors: number;
	recentChecks: boolean[];
};

export function nextFollowupDueAt(lastUpdateAt: number, autoUpdateCount: number, cadenceMinutes: number): number {
	const exponent = Math.max(0, autoUpdateCount - 1);
	const multiplier = Math.min(8, 2 ** exponent);
	return lastUpdateAt + cadenceMinutes * multiplier * 60_000;
}

export function advanceStatus(current: AutopilotIncidentStatus, signal: StatusSignal): AutopilotIncidentStatus {
	if (current === 'resolved') return current;
	if (current === 'monitoring' && !signal.latestOk) return signal.regressionUsed ? current : 'identified';
	if ((current === 'investigating' || current === 'identified') && signal.consecutiveOk >= 2 && !signal.regressionUsed) return 'monitoring';
	if (current === 'investigating' && signal.consecutiveFailures >= 3 && signal.failureSignatureStable) return 'identified';
	return current;
}

export function computeImpact(signal: ImpactSignal): 'minor' | 'major' | 'critical' {
	if (signal.kind === 'degraded') return 'minor';
	if (signal.affectedMonitors >= 2 && signal.totalMonitors > 0 && signal.affectedMonitors / signal.totalMonitors >= 0.5) return 'critical';
	if (signal.affectedMonitors >= 3) return 'critical';
	if (signal.recentChecks.length >= 10 && signal.recentChecks.slice(0, 10).every((ok) => !ok)) return 'major';
	if (signal.recentChecks.some(Boolean)) return 'minor';
	return 'major';
}
