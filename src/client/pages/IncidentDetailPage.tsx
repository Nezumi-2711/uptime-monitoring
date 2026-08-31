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
					<ArrowLeft aria-hidden="true" /> All service status
				</button>
				{query.isPending ? (
					<p className="status-loading" aria-busy="true">
						Loading incident…
					</p>
				) : query.isError || !query.data ? (
					<section className="incident-detail-card incident-detail-error">
						<TriangleAlert aria-hidden="true" />
						<h1>Incident not found</h1>
						<p>{query.error?.message ?? 'The requested incident could not be loaded.'}</p>
					</section>
				) : (
					<article className="incident-detail-card">
						<header className="incident-detail-header">
							<div className="incident-detail-title">
								<p className="overline">Incident report</p>
								<h1>{query.data.incident.title}</h1>
							</div>
							<Badge variant={query.data.incident.status === 'resolved' ? 'online' : 'offline'}>{query.data.incident.status}</Badge>
						</header>
						<dl className="incident-detail-summary">
							<div>
								<dt>Started</dt>
								<dd>
									<time dateTime={query.data.incident.startedAt}>{dateTime.format(new Date(query.data.incident.startedAt))}</time>
								</dd>
							</div>
							<div>
								<dt>Impact</dt>
								<dd className="incident-detail-impact">{query.data.incident.impact}</dd>
							</div>
							<div>
								<dt>Affected services</dt>
								<dd>
									{query.data.incident.services.length > 0
										? query.data.incident.services.map((service) => service.name).join(', ')
										: 'General service incident'}
								</dd>
							</div>
						</dl>
						<IncidentTimeline updates={query.data.incident.updates ?? []} />
					</article>
				)}
			</main>
		</div>
	);
}
