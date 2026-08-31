export type AutopilotCandidate = {
	source: string;
	resolvedAt: Date | null;
	hasManualUpdate: boolean;
	alertsEnabled: boolean;
};

export function autopilotEligible(candidate: AutopilotCandidate): boolean {
	return candidate.source === 'auto' && candidate.resolvedAt === null && !candidate.hasManualUpdate && candidate.alertsEnabled;
}

export const AUTOPILOT_WRITE_GUARD = `
	i.source = 'auto'
	AND i.resolved_at IS NULL
	AND i.updated_at = ?
	AND NOT EXISTS (
		SELECT 1 FROM incident_updates manual
		WHERE manual.incident_id = i.id AND manual.source = 'manual'
	)`;
