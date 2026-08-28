import { ArrowLeft, BellOff, CheckCircle2, Clock3, ExternalLink, RefreshCw, Zap } from 'lucide-react';
import { LatencySparkline } from '../components/charts/LatencySparkline';
import { UptimeBar } from '../components/charts/UptimeBar';
import { navigate } from '../lib/router';
import { useLogoutMutation } from '../queries/auth';
import {
	useMonitorChecksQuery,
	useMonitorIncidentsQuery,
	useMonitorQuery,
	useMonitorStatsQuery,
	useRunCheckMutation,
} from '../queries/monitors';

function formatDate(value: string) {
	return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function formatDuration(ms: number | null, startedAt: string) {
	const duration = ms ?? Math.max(0, Date.now() - new Date(startedAt).getTime());
	if (duration < 60_000) return `${Math.max(1, Math.round(duration / 1000))} sec`;
	if (duration < 3_600_000) return `${Math.round(duration / 60_000)} min`;
	if (duration < 86_400_000) return `${Math.round(duration / 3_600_000)} hr`;
	return `${Math.round(duration / 86_400_000)} days`;
}

function statusDetails(lastOk: boolean | null) {
	if (lastOk === true) return { label: 'Operational', className: 'online' };
	if (lastOk === false) return { label: 'Down', className: 'offline' };
	return { label: 'Awaiting first check', className: 'checking' };
}

export function MonitorDetailPage({ id }: { id: number }) {
	const monitorQuery = useMonitorQuery(id);
	const checksQuery = useMonitorChecksQuery(id);
	const statsQuery = useMonitorStatsQuery(id);
	const incidentsQuery = useMonitorIncidentsQuery(id);
	const checkMutation = useRunCheckMutation();
	const logoutMutation = useLogoutMutation();
	const monitor = monitorQuery.data?.monitor;
	const checks = checksQuery.data?.checks ?? [];
	const incidents = incidentsQuery.data?.incidents ?? [];
	const status = statusDetails(monitor?.lastOk ?? null);
	const openIncident = incidents.find((incident) => incident.resolvedAt === null);

	if (monitorQuery.isPending)
		return (
			<div className="full-page-loading">
				<RefreshCw className="loading-mark" />
				<p>Loading monitor history…</p>
			</div>
		);
	if (monitorQuery.isError || !monitor)
		return (
			<div className="detail-error">
				<strong>Monitor not found</strong>
				<p>The requested monitor could not be loaded.</p>
				<button className="secondary-button" onClick={() => navigate('/dashboard')}>
					Return to dashboard
				</button>
			</div>
		);

	return (
		<div className="dashboard-shell">
			<header className="dashboard-header">
				<div className="dashboard-header-inner">
					<button className="brand brand-button" type="button" onClick={() => navigate('/dashboard')}>
						<Zap className="brand-mark" fill="currentColor" />
						<span>upwatch</span>
					</button>
					<div className="nav-actions">
						<button className="nav-auth" onClick={() => navigate('/settings')}>
							Settings
						</button>
						<button className="nav-auth" onClick={() => logoutMutation.mutate()} disabled={logoutMutation.isPending}>
							Sign out
						</button>
					</div>
				</div>
			</header>
			<main className="dashboard-main detail-main">
				<button className="back-link" type="button" onClick={() => navigate('/dashboard')}>
					<ArrowLeft /> All monitors
				</button>
				<section className="detail-hero">
					<div className="detail-title">
						<span className={`status-orb ${status.className}`} />
						<div>
							<p className="overline">Monitor #{monitor.id}</p>
							<h1>{monitor.name}</h1>
							<a href={monitor.url} target="_blank" rel="noreferrer">
								{monitor.url}
								<ExternalLink />
							</a>
						</div>
					</div>
					<div className="detail-actions">
						<span className={`row-status ${status.className}`}>
							<i />
							{status.label}
						</span>
						{!monitor.alertsEnabled && (
							<span className="muted-alert">
								<BellOff /> Alerts muted
							</span>
						)}
						<button className="primary-button" type="button" onClick={() => checkMutation.mutate(id)} disabled={checkMutation.isPending}>
							{checkMutation.isPending ? 'Checking…' : 'Check now'}
						</button>
					</div>
				</section>

				<section className="sla-grid" aria-label="Uptime windows">
					{(['24h', '7d', '30d', '90d'] as const).map((key) => {
						const window = statsQuery.data?.windows[key];
						return (
							<article className="sla-card" key={key}>
								<p>{key} uptime</p>
								<strong>{window?.uptimePct == null ? '—' : `${window.uptimePct.toFixed(3)}%`}</strong>
								<span>
									{window?.totalChecks ?? 0} checks · {window?.avgLatencyMs ?? '—'} ms avg
								</span>
							</article>
						);
					})}
					<article className={`sla-card incident-summary ${openIncident ? 'has-incident' : ''}`}>
						<p>Current incident</p>
						<strong>{openIncident ? formatDuration(null, openIncident.startedAt) : 'None'}</strong>
						<span>{openIncident ? `Open since ${formatDate(openIncident.startedAt)}` : 'Everything is operational'}</span>
					</article>
				</section>

				<div className="detail-grid">
					<section className="data-panel chart-panel">
						<div className="data-panel-heading">
							<div>
								<p className="overline">Response time</p>
								<h2>Latency</h2>
							</div>
							<span>Last {checks.length} checks</span>
						</div>
						<LatencySparkline checks={checks} />
					</section>
					<section className="data-panel uptime-panel">
						<div className="data-panel-heading">
							<div>
								<p className="overline">Availability</p>
								<h2>Recent uptime</h2>
							</div>
							<span>
								{checks.filter((check) => check.ok).length}/{checks.length} successful
							</span>
						</div>
						<UptimeBar checks={checks} />
					</section>
				</div>

				<div className="detail-grid lower-grid">
					<section className="data-panel recent-checks-panel">
						<div className="data-panel-heading">
							<div>
								<p className="overline">Event stream</p>
								<h2>Recent checks</h2>
							</div>
							<span>{Math.min(checks.length, 20)} shown</span>
						</div>
						{/* Keyboard focus makes this horizontally scrollable region accessible without a pointer. */}
						{/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
						<section className="data-table-wrap recent-checks-scroll" aria-label="Recent checks" tabIndex={0}>
							<table className="data-table">
								<thead>
									<tr>
										<th>Status</th>
										<th>Response</th>
										<th>Latency</th>
										<th>Checked</th>
									</tr>
								</thead>
								<tbody>
									{checks.slice(0, 20).map((check) => (
										<tr key={check.id}>
											<td>
												<span className={`row-status ${check.ok ? 'online' : 'offline'}`}>
													<i />
													{check.ok ? 'Up' : 'Down'}
												</span>
											</td>
											<td>
												<code>{check.statusCode ? `HTTP ${check.statusCode}` : (check.error ?? 'Failed')}</code>
											</td>
											<td>{check.latencyMs} ms</td>
											<td>{formatDate(check.checkedAt)}</td>
										</tr>
									))}
								</tbody>
							</table>
							{checks.length === 0 && <div className="table-empty">No checks recorded.</div>}
						</section>
					</section>
					<section className="data-panel">
						<div className="data-panel-heading">
							<div>
								<p className="overline">Downtime</p>
								<h2>Incidents</h2>
							</div>
							<span>{incidents.length} recorded</span>
						</div>
						<div className="incident-list">
							{incidents.map((incident) => (
								<article className={incident.resolvedAt ? 'resolved' : 'open'} key={incident.id}>
									<span>{incident.resolvedAt ? <CheckCircle2 /> : <Clock3 />}</span>
									<div>
										<strong>{incident.resolvedAt ? 'Resolved incident' : 'Incident in progress'}</strong>
										<p>
											{incident.startError ??
												(incident.startStatusCode ? `HTTP ${incident.startStatusCode}` : 'Endpoint became unavailable')}
										</p>
										<small>
											{formatDate(incident.startedAt)} · {formatDuration(incident.durationMs, incident.startedAt)}
										</small>
									</div>
								</article>
							))}
							{incidents.length === 0 && <div className="table-empty">No downtime incidents recorded.</div>}
						</div>
					</section>
				</div>
			</main>
		</div>
	);
}
