import { ArrowLeft, TriangleAlert, Zap } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { IncidentTimeline } from '../components/IncidentTimeline';
import { navigate } from '../lib/router';
import { usePublicIncidentQuery } from '../queries/status';

const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: 'long', timeStyle: 'short' });

export function IncidentDetailPage({ id }: { id: number }) {
	const query = usePublicIncidentQuery(id);
	return (
		<div className="status-page-shell">
			<header className="dashboard-header status-header">
				<div className="dashboard-header-inner status-header-inner">
					<a className="brand" href="/" aria-label="Upwatch public status">
						<Zap className="brand-mark" fill="currentColor" /> <span>upwatch</span>
					</a>
					<Button variant="unstyled" className="status-header-action" onClick={() => navigate('/')}>
						Status page
					</Button>
				</div>
			</header>
			<main className="status-main incident-detail-page">
				<button className="incident-back" type="button" onClick={() => navigate('/')}>
					<ArrowLeft /> All service status
				</button>
				{query.isPending ? (
					<p className="status-loading" aria-busy="true">
						Loading incident…
					</p>
				) : query.isError || !query.data ? (
					<section className="incident-detail-card">
						<TriangleAlert />
						<h1>Incident not found</h1>
						<p>{query.error?.message}</p>
					</section>
				) : (
					<article className="incident-detail-card">
						<header className="incident-detail-header">
							<div>
								<p className="overline">Incident report</p>
								<h1>{query.data.incident.title}</h1>
							</div>
							<Badge variant={query.data.incident.status === 'resolved' ? 'online' : 'offline'}>{query.data.incident.status}</Badge>
						</header>
						<p className="incident-detail-meta">Started {dateTime.format(new Date(query.data.incident.startedAt))}</p>
						{query.data.incident.services.length > 0 && (
							<p className="incident-detail-services">
								<strong>Affected services:</strong> {query.data.incident.services.map((service) => service.name).join(', ')}
							</p>
						)}
						<IncidentTimeline updates={query.data.incident.updates ?? []} />
					</article>
				)}
			</main>
		</div>
	);
}
