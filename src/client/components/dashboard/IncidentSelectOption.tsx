import { Activity, CircleCheck, CircleMinus, Crosshair, OctagonAlert, Search, Siren, TriangleAlert, type LucideIcon } from 'lucide-react';
import type { IncidentImpact, IncidentStatus } from '../../api/incidents';

export const INCIDENT_STATUSES: IncidentStatus[] = ['investigating', 'identified', 'monitoring', 'resolved'];
export const INCIDENT_IMPACTS: IncidentImpact[] = ['none', 'minor', 'major', 'critical'];

const statusOptions: Record<IncidentStatus, { label: string; icon: LucideIcon; tone: string }> = {
	investigating: { label: 'Investigating', icon: Search, tone: 'blue' },
	identified: { label: 'Identified', icon: Crosshair, tone: 'violet' },
	monitoring: { label: 'Monitoring', icon: Activity, tone: 'amber' },
	resolved: { label: 'Resolved', icon: CircleCheck, tone: 'green' },
};

const impactOptions: Record<IncidentImpact, { label: string; icon: LucideIcon; tone: string }> = {
	none: { label: 'None', icon: CircleMinus, tone: 'neutral' },
	minor: { label: 'Minor', icon: TriangleAlert, tone: 'yellow' },
	major: { label: 'Major', icon: OctagonAlert, tone: 'orange' },
	critical: { label: 'Critical', icon: Siren, tone: 'red' },
};

function IncidentOption({ label, icon: Icon, tone }: { label: string; icon: LucideIcon; tone: string }) {
	return (
		<span className="incident-select-option">
			<span className={`incident-select-icon incident-select-icon-${tone}`} aria-hidden="true">
				<Icon />
			</span>
			<span>{label}</span>
		</span>
	);
}

export function IncidentStatusOption({ value }: { value: IncidentStatus }) {
	return <IncidentOption {...statusOptions[value]} />;
}

export function IncidentImpactOption({ value }: { value: IncidentImpact }) {
	return <IncidentOption {...impactOptions[value]} />;
}
