import { useState } from 'react';
import { Plus, TriangleAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { Incident } from '../../api/incidents';
import { navigate } from '../../lib/router';
import { useIncidentsQuery } from '../../queries/incidents';
import { IncidentDialog } from './IncidentDialog';
import { IncidentUpdateDialog } from './IncidentUpdateDialog';

export function IncidentsPanel() {
	const query = useIncidentsQuery('open');
	const [declareOpen, setDeclareOpen] = useState(false);
	const [updating, setUpdating] = useState<Incident | null>(null);
	const incidents = query.data?.incidents ?? [];
	return (
		<section className="mt-6 flex min-h-0 flex-col overflow-hidden rounded-md border border-border-subtle bg-white dark:border-white/8 dark:bg-night-panel dark:shadow-[0_16px_40px_rgba(0,0,0,0.35)]">
			<header className="panel-heading">
				<div>
					<p className="overline">Communication</p>
					<h2>Active incidents</h2>
					<p>Customer-facing incident lifecycle and updates.</p>
				</div>
				<Button variant="unstyled" className="primary-button" onClick={() => setDeclareOpen(true)}>
					<Plus /> Declare incident
				</Button>
			</header>
			{incidents.length === 0 ? (
				<div className="flex items-center justify-start gap-5 p-7 text-body-md leading-alert text-muted-foreground dark:text-neutral-400 [&>svg]:size-6 [&>svg]:shrink-0">
					<TriangleAlert />
					<div>
						<strong>No active incidents</strong>
						<p>Declare an incident when service impact is not detected by HTTP probes.</p>
					</div>
				</div>
			) : (
				<div className="flex flex-col">
					{incidents.map((incident) => (
						<article
							key={incident.id}
							className="flex flex-col items-stretch justify-between gap-5 border-t border-border px-5.5 py-4.5 transition-colors hover:bg-neutral-50 sm:flex-row sm:items-center dark:border-white/6 dark:hover:bg-white/2"
						>
							<div className="grid flex-1 gap-1">
								<button
									type="button"
									className="cursor-pointer border-0 bg-transparent p-0 text-left font-medium text-foreground hover:text-brand-deep dark:text-neutral-50 dark:hover:text-brand"
									onClick={() => navigate(`/incidents/${incident.id}`)}
								>
									{incident.title ?? 'Service disruption'}
								</button>
								<span className="text-micro text-muted-foreground dark:text-neutral-400">
									{incident.monitorIds.length} services · {incident.updateCount ?? 0} updates
								</span>
							</div>
							<Badge variant={incident.impact === 'critical' ? 'offline' : 'checking'}>{incident.status}</Badge>
							<Button variant="unstyled" className="secondary-button" onClick={() => setUpdating(incident)}>
								Post update
							</Button>
						</article>
					))}
				</div>
			)}
			{declareOpen && <IncidentDialog onClose={() => setDeclareOpen(false)} />}
			{updating && <IncidentUpdateDialog incident={updating} onClose={() => setUpdating(null)} />}
		</section>
	);
}
