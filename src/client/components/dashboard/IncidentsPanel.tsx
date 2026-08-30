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
		<section className="dashboard-panel incidents-panel">
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
				<div className="incidents-empty">
					<TriangleAlert />
					<div>
						<strong>No active incidents</strong>
						<p>Declare an incident when service impact is not detected by HTTP probes.</p>
					</div>
				</div>
			) : (
				<div className="dashboard-incident-list">
					{incidents.map((incident) => (
						<article key={incident.id}>
							<div>
								<button type="button" onClick={() => navigate(`/incidents/${incident.id}`)}>
									{incident.title ?? 'Service disruption'}
								</button>
								<span>
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
