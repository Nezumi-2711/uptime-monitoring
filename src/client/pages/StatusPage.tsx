import { useEffect, useState } from 'react';
import { Activity, CircleCheck, Database, RefreshCw, TriangleAlert, Zap } from 'lucide-react';
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { PublicOverallStatus, PublicServiceStatus } from '../api/status';
import { SiteIcon } from '../components/SiteIcon';
import { StatusHistoryBar } from '../components/StatusHistoryBar';
import { navigate } from '../lib/router';
import { useSessionQuery } from '../queries/auth';
import { useStatusQuery } from '../queries/status';

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
	down: { label: 'Down', className: 'offline' },
	unknown: { label: 'Awaiting data', className: 'checking' },
};

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
	const sessionQuery = useSessionQuery();
	const [now, setNow] = useState(Date.now);
	const status = statusQuery.data;

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
					<section className="status-panel-state status-error-state">
						<span>
							<TriangleAlert />
						</span>
						<strong>Status could not be loaded</strong>
						<p>{errorMessage(statusQuery.error)}</p>
						<Button variant="unstyled" className="secondary-button" type="button" onClick={() => void statusQuery.refetch()}>
							Try again
						</Button>
					</section>
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
								<div className="status-panel-state">
									<span>
										<Database />
									</span>
									<strong>No public services yet</strong>
									<p>Service health will appear here after monitoring is enabled.</p>
								</div>
							) : (
								<div className="public-service-list">
									{status.services.map((service) => {
										const serviceStatus = SERVICE_STATUS[service.status];
										return (
											<article className="public-service-row" key={service.id}>
												<div className="public-service-summary">
													<span className="service-icon">
														<SiteIcon monitorId={service.id} favicon="public" />
													</span>
													<div>
														<strong>{service.name}</strong>
														<Badge className="mt-1.75" variant={serviceStatus.className}>
															{serviceStatus.label}
														</Badge>
													</div>
												</div>
												<div className="public-service-uptime">
													<span>90-day uptime</span>
													<strong>{service.uptime90d === null ? '—' : `${service.uptime90d.toFixed(1)}%`}</strong>
												</div>
												<StatusHistoryBar history={service.history} />
											</article>
										);
									})}
								</div>
							)}
						</section>
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
