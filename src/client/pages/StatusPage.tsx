import { useEffect, useState } from 'react';
import { Activity, ChevronRight, CircleCheck, Database, History, RefreshCw, TriangleAlert, Wrench, Zap } from 'lucide-react';
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import type { PublicOverallStatus, PublicServiceStatus } from '../api/status';
import { SiteIcon } from '../components/SiteIcon';
import { StatusHistoryBar } from '../components/StatusHistoryBar';
import { formatDate, formatDuration } from '../lib/format';
import { navigate } from '../lib/router';
import { useSeo } from '../lib/seo';
import { useSessionQuery } from '../queries/auth';
import { useIncidentHistoryQuery, useStatusQuery } from '../queries/status';

const OVERALL_COPY: Record<PublicOverallStatus, { title: string; detail: string }> = {
	operational: {
		title: 'All systems operational',
		detail: 'Every monitored service is responding normally.',
	},
	degraded: {
		title: 'Some systems are degraded',
		detail: 'One or more services are currently experiencing disruption.',
	},
	down: {
		title: 'Major service disruption',
		detail: 'All reporting services are currently unavailable.',
	},
};

const SERVICE_STATUS: Record<PublicServiceStatus, { label: string; className: BadgeVariant }> = {
	up: { label: 'Operational', className: 'online' },
	degraded: { label: 'Degraded performance', className: 'pending' },
	down: { label: 'Down', className: 'offline' },
	unknown: { label: 'Awaiting data', className: 'checking' },
	maintenance: { label: 'Under maintenance', className: 'maintenance' },
};

const INCIDENT_IMPACT: Record<string, { label: string; tone: string }> = {
	critical: { label: 'Critical', tone: 'critical' },
	major: { label: 'Major', tone: 'major' },
	minor: { label: 'Minor', tone: 'minor' },
	none: { label: 'Maintenance', tone: 'none' },
};

const maintenanceTime = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });
const resolvedTime = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });

function errorMessage(error: unknown) {
	return error instanceof Error ? error.message : 'Unknown request error';
}

function relativeUpdate(updatedAt: number, now: number) {
	const seconds = Math.max(0, Math.floor((now - updatedAt) / 1_000));
	if (seconds < 5) return 'Updated just now';
	if (seconds < 60) return `Updated ${seconds}s ago`;
	const minutes = Math.floor(seconds / 60);
	return `Updated ${minutes}m ago`;
}

function OverallIcon({ status }: { status: PublicOverallStatus }) {
	if (status === 'operational') return <CircleCheck aria-hidden="true" />;
	if (status === 'degraded') return <TriangleAlert aria-hidden="true" />;
	return <Activity aria-hidden="true" />;
}

export function StatusPage() {
	const statusQuery = useStatusQuery();
	const historyQuery = useIncidentHistoryQuery();
	const sessionQuery = useSessionQuery();
	const [now, setNow] = useState(Date.now);
	const status = statusQuery.data;
	const activeIncidents = status?.activeIncidents ?? [];
	const maintenanceServices = status?.services.filter((service) => service.maintenance) ?? [];
	const pastIncidents = historyQuery.data?.incidents ?? [];
	const operationalServices = status?.services.filter((service) => service.status === 'up').length ?? 0;
	const affectedServices = (status?.services.length ?? 0) - operationalServices;
	const description = status
		? `${status.services.length} ${status.services.length === 1 ? 'service' : 'services'} · ${operationalServices} operational, ${affectedServices} affected · ${activeIncidents.length} active ${activeIncidents.length === 1 ? 'incident' : 'incidents'}`
		: 'Live operational health and 90-day availability for every public service.';
	useSeo({
		title: status ? `${OVERALL_COPY[status.overall].title} — upwatch status` : 'Service status — upwatch',
		description,
		canonicalPath: '/',
	});

	useEffect(() => {
		const timer = window.setInterval(() => setNow(Date.now()), 5_000);
		return () => window.clearInterval(timer);
	}, []);

	return (
		<div className="status-page-shell">
			<header className="dashboard-header status-header">
				<div className="dashboard-header-inner status-header-inner">
					<a className="brand" href="/" aria-label="Upwatch public status">
						<Zap className="brand-mark" fill="currentColor" />
						<span>upwatch</span>
					</a>
					<Button
						variant="unstyled"
						className="status-header-action"
						type="button"
						onClick={() => navigate(sessionQuery.data?.authenticated ? '/dashboard' : '/login')}
					>
						{sessionQuery.data?.authenticated ? 'Dashboard' : 'Sign in'}
					</Button>
				</div>
			</header>

			<main className="status-main">
				<section className="status-intro">
					<p className="overline">System status</p>
					<h1>Service availability</h1>
					<p>Live operational health and 90-day availability for every public service.</p>
				</section>

				{statusQuery.isPending ? (
					<div className="status-loading" aria-busy="true" aria-label="Loading service status">
						<div className="status-banner-skeleton" />
						<div className="status-service-skeleton">
							{[0, 1, 2].map((item) => (
								<div key={item}>
									<i />
									<span />
									<b />
								</div>
							))}
						</div>
					</div>
				) : statusQuery.isError || !status ? (
					<Empty variant="error" className="mt-10.5 min-h-70 place-content-center p-12">
						<EmptyMedia variant="icon">
							<TriangleAlert />
						</EmptyMedia>
						<EmptyTitle>Status could not be loaded</EmptyTitle>
						<EmptyDescription>{errorMessage(statusQuery.error)}</EmptyDescription>
						<EmptyContent>
							<Button variant="unstyled" className="secondary-button" type="button" onClick={() => void statusQuery.refetch()}>
								Try again
							</Button>
						</EmptyContent>
					</Empty>
				) : (
					<>
						<section className={`status-banner ${status.overall}`} aria-live="polite">
							<span className="status-banner-icon">
								<OverallIcon status={status.overall} />
							</span>
							<div>
								<h2>{OVERALL_COPY[status.overall].title}</h2>
								<p>{OVERALL_COPY[status.overall].detail}</p>
							</div>
							<time dateTime={new Date(status.updatedAt).toISOString()}>{relativeUpdate(status.updatedAt, now)}</time>
						</section>

						{maintenanceServices.length > 0 && (
							<section className="scheduled-maintenance" aria-labelledby="scheduled-maintenance-title" aria-live="polite">
								<header className="scheduled-maintenance-header">
									<div className="scheduled-maintenance-heading">
										<span className="scheduled-maintenance-icon">
											<Wrench aria-hidden="true" />
										</span>
										<div>
											<p>Scheduled maintenance</p>
											<h2 id="scheduled-maintenance-title">Planned service work is in progress</h2>
										</div>
									</div>
									<span className="scheduled-maintenance-count">
										{maintenanceServices.length} {maintenanceServices.length === 1 ? 'service' : 'services'}
									</span>
								</header>
								<div className="scheduled-maintenance-list">
									{maintenanceServices.map((service) => (
										<article className="scheduled-maintenance-row" key={service.id}>
											<div className="scheduled-maintenance-service">
												<span className="scheduled-maintenance-service-icon">
													<SiteIcon monitorId={service.id} favicon="public" />
												</span>
												<div>
													<strong>{service.name}</strong>
													<span>{service.maintenance?.name}</span>
												</div>
											</div>
											<span className="scheduled-maintenance-state">
												<i /> until {maintenanceTime.format(new Date(service.maintenance!.endsAt))}
											</span>
										</article>
									))}
								</div>
							</section>
						)}

						{activeIncidents.length > 0 && (
							<section className="active-incidents" aria-labelledby="active-incidents-title" aria-live="polite">
								<header className="active-incidents-header">
									<div className="active-incidents-heading">
										<span className="active-incidents-icon">
											<TriangleAlert aria-hidden="true" />
										</span>
										<div>
											<p>Active incident</p>
											<h2 id="active-incidents-title">We’re working to restore service</h2>
										</div>
									</div>
									<span className="active-incidents-count">
										{activeIncidents.length} {activeIncidents.length === 1 ? 'incident' : 'incidents'} active
									</span>
								</header>

								<div className="active-incident-list">
									{activeIncidents.map((incident) => (
										<article className="active-incident-row" key={incident.id}>
											<div className="active-incident-service">
												<span className="active-incident-service-icon">
													<TriangleAlert />
												</span>
												<div>
													<button type="button" onClick={() => navigate(`/incidents/${incident.id}`)}>
														<strong>{incident.title}</strong>
													</button>
													<span>
														{incident.services.length
															? incident.services.map((service) => service.name).join(', ')
															: 'General service incident'}
													</span>
												</div>
											</div>
											<p>{incident.latestUpdate?.body}</p>
											<span className="active-incident-state">
												<i /> {incident.status}
											</span>
										</article>
									))}
								</div>
							</section>
						)}

						<section className="public-services-panel" aria-labelledby="public-services-title">
							<div className="public-services-heading">
								<div>
									<h2 id="public-services-title">Services</h2>
									<p>Availability is calculated from checks collected over the last 90 days.</p>
								</div>
								<Button
									variant="unstyled"
									className="icon-button"
									type="button"
									onClick={() => void statusQuery.refetch()}
									disabled={statusQuery.isFetching}
									aria-label="Refresh service status"
								>
									<RefreshCw className={statusQuery.isFetching ? 'is-spinning' : ''} />
								</Button>
							</div>

							{status.services.length === 0 ? (
								<Empty className="min-h-70 place-content-center p-12">
									<EmptyMedia variant="icon">
										<Database />
									</EmptyMedia>
									<EmptyTitle>No public services yet</EmptyTitle>
									<EmptyDescription>Service health will appear here after monitoring is enabled.</EmptyDescription>
								</Empty>
							) : (
								<div className="public-service-list">
									{status.services.map((service) => {
										const serviceStatus = SERVICE_STATUS[service.status];
										return (
											<article className="public-service-row" key={service.id}>
												<div className="public-service-header">
													<div className="public-service-summary">
														<span className="service-icon">
															<SiteIcon monitorId={service.id} favicon="public" />
														</span>
														<div className="public-service-identity">
															<strong>{service.name}</strong>
															<Badge variant={serviceStatus.className}>{serviceStatus.label}</Badge>
														</div>
													</div>
													<div className="public-service-uptime">
														<span>90-day uptime</span>
														<strong>{service.uptime90d === null ? '—' : `${service.uptime90d.toFixed(1)}%`}</strong>
													</div>
												</div>
												<StatusHistoryBar history={service.history} />
											</article>
										);
									})}
								</div>
							)}
						</section>

						{!historyQuery.isPending && !historyQuery.isError && (
							<section className="past-incidents" aria-labelledby="past-incidents-title">
								<header className="past-incidents-header">
									<div className="past-incidents-heading">
										<span className="past-incidents-icon">
											<History aria-hidden="true" />
										</span>
										<div>
											<p>Last 30 days</p>
											<h2 id="past-incidents-title">Past incidents</h2>
										</div>
									</div>
									<span className="past-incidents-count">
										{pastIncidents.length === 0 ? 'No incidents' : `${pastIncidents.length} resolved`}
									</span>
								</header>

								{pastIncidents.length === 0 ? (
									<Empty className="min-h-70 place-content-center p-12">
										<EmptyMedia variant="icon">
											<CircleCheck />
										</EmptyMedia>
										<EmptyTitle>No incidents in the last 30 days</EmptyTitle>
										<EmptyDescription>Every monitored service stayed healthy for the full window.</EmptyDescription>
									</Empty>
								) : (
									<div className="past-incident-list">
										{pastIncidents.map((incident) => {
											const impact = INCIDENT_IMPACT[incident.impact] ?? INCIDENT_IMPACT.none;
											return (
												<button
													className="past-incident-row"
													key={incident.id}
													type="button"
													onClick={() => navigate(`/incidents/${incident.id}`)}
												>
													<span className="past-incident-icon">
														<CircleCheck aria-hidden="true" />
													</span>
													<span className="past-incident-body">
														<span className="past-incident-title">
															<strong>{incident.title}</strong>
															<span className={`past-incident-impact ${impact.tone}`}>{impact.label}</span>
														</span>
														<span className="past-incident-services">
															{incident.services.length
																? incident.services.map((service) => service.name).join(', ')
																: 'General service incident'}
														</span>
														{incident.latestUpdate?.body && <span className="past-incident-summary">{incident.latestUpdate.body}</span>}
														<span className="past-incident-meta">
															<time dateTime={incident.startedAt}>{formatDate(incident.startedAt)}</time>
															<i aria-hidden="true">·</i> down {formatDuration(incident.durationMs ?? null, incident.startedAt)}
															{incident.resolvedAt && (
																<>
																	<i aria-hidden="true">·</i> resolved {resolvedTime.format(new Date(incident.resolvedAt))}
																</>
															)}
														</span>
													</span>
													<ChevronRight className="past-incident-chevron" aria-hidden="true" />
												</button>
											);
										})}
									</div>
								)}
							</section>
						)}
					</>
				)}
			</main>

			<footer className="status-footer">
				<span>Powered by upwatch</span>
				<span>
					<i /> Monitoring from Cloudflare's edge
				</span>
			</footer>
		</div>
	);
}
