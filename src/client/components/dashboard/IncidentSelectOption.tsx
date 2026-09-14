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

const toneClasses: Record<string, string> = {
	blue: 'text-tone-blue bg-tone-blue-bg dark:text-blue-400 dark:bg-blue-600/18',
	violet: 'text-tone-violet bg-tone-violet-bg dark:text-purple-400 dark:bg-purple-600/18',
	amber: 'text-tone-amber bg-tone-amber-bg dark:text-amber-400 dark:bg-amber-600/20',
	green: 'text-tone-green bg-tone-green-bg dark:text-emerald-400 dark:bg-emerald-600/18',
	neutral: 'text-tone-neutral bg-tone-neutral-bg dark:text-neutral-400 dark:bg-white/8',
	yellow: 'text-tone-yellow bg-tone-yellow-bg dark:text-yellow-400 dark:bg-yellow-600/20',
	orange: 'text-tone-orange bg-tone-orange-bg dark:text-orange-400 dark:bg-orange-600/20',
	red: 'text-tone-red bg-tone-red-bg dark:text-red-400 dark:bg-red-600/20',
};

function IncidentOption({ label, icon: Icon, tone }: { label: string; icon: LucideIcon; tone: string }) {
	return (
		<span className="inline-flex min-w-0 items-center gap-2 capitalize">
			<span
				className={`inline-flex size-5.5 shrink-0 items-center justify-center rounded-[5px] [&>svg]:size-3.25 [&>svg]:stroke-2 ${toneClasses[tone] ?? ''}`}
				aria-hidden="true"
			>
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
