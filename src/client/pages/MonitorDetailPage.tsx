import { useState } from 'react';
import { ArrowLeft, BellOff, CheckCircle2, Clock3, ExternalLink, Pencil, Power, PowerOff, RefreshCw, Trash2 } from 'lucide-react';
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Empty, EmptyContent, EmptyDescription, EmptyTitle } from '@/components/ui/empty';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AppHeader } from '../components/AppHeader';
import { LatencySparkline } from '../components/charts/LatencySparkline';
import { UptimeBar } from '../components/charts/UptimeBar';
import { DeleteMonitorDialog } from '../components/dashboard/DeleteMonitorDialog';
import { INTERVAL_OPTIONS, MonitorFormDialog } from '../components/dashboard/MonitorFormDialog';
import { navigate } from '../lib/router';
import {
	useDeleteMonitorMutation,
	useMonitorChecksQuery,
	useMonitorIncidentsQuery,
	useMonitorQuery,
	useMonitorStatsQuery,
	useRunCheckMutation,
	useUpdateMonitorMutation,
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

function statusDetails(lastOk: boolean | null): { label: string; className: BadgeVariant } {
	if (lastOk === true) return { label: 'Operational', className: 'online' };
	if (lastOk === false) return { label: 'Down', className: 'offline' };
	return { label: 'Awaiting first check', className: 'checking' };
}

function formatInterval(seconds: number) {
	return INTERVAL_OPTIONS.find((option) => Number(option.value) === seconds)?.label ?? `${Math.round(seconds / 60)} min`;
}

export function MonitorDetailPage({ id }: { id: number }) {
	const [isEditing, setIsEditing] = useState(false);
	const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
	const monitorQuery = useMonitorQuery(id);
	const checksQuery = useMonitorChecksQuery(id);
	const statsQuery = useMonitorStatsQuery(id);
	const incidentsQuery = useMonitorIncidentsQuery(id);
	const checkMutation = useRunCheckMutation();
	const updateMutation = useUpdateMonitorMutation();
	const deleteMutation = useDeleteMonitorMutation();
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
			<div className="grid min-h-dvh place-content-center">
				<Empty>
					<EmptyTitle>Monitor not found</EmptyTitle>
					<EmptyDescription>The requested monitor could not be loaded.</EmptyDescription>
					<EmptyContent>
						<Button variant="unstyled" className="secondary-button" onClick={() => navigate('/dashboard')}>
							Return to dashboard
						</Button>
					</EmptyContent>
				</Empty>
			</div>
		);

	return (
		<div className="dashboard-shell">
			<AppHeader />
			{isEditing && <MonitorFormDialog key={monitor.id} editing={monitor} onClose={() => setIsEditing(false)} />}
			<DeleteMonitorDialog
				monitor={isConfirmingDelete ? monitor : null}
				isPending={deleteMutation.isPending}
				onCancel={() => setIsConfirmingDelete(false)}
				onConfirm={() => deleteMutation.mutate(monitor.id, { onSuccess: () => navigate('/dashboard') })}
			/>
			<main className="dashboard-main detail-main">
				<Button variant="unstyled" className="back-link" type="button" onClick={() => navigate('/dashboard')}>
					<ArrowLeft /> All monitors
				</Button>
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
						<Badge variant={status.className}>{status.label}</Badge>
						{!monitor.alertsEnabled && (
							<span className="muted-alert">
								<BellOff /> Alerts muted
							</span>
						)}
						<Button
							variant="unstyled"
							className="primary-button"
							type="button"
							onClick={() => checkMutation.mutate(id)}
							disabled={checkMutation.isPending}
						>
							{checkMutation.isPending ? 'Checking…' : 'Check now'}
						</Button>
					</div>
				</section>

				<section className="sla-grid" aria-label="Uptime windows">
					{(['24h', '7d', '30d', '90d'] as const).map((key) => {
						const window = statsQuery.data?.windows[key];
						return (
							<Card asChild key={key}>
								<article className="sla-card">
									<p>{key} uptime</p>
									<strong>{window?.uptimePct == null ? '—' : `${window.uptimePct.toFixed(3)}%`}</strong>
									<span>
										{window?.totalChecks ?? 0} checks · {window?.avgLatencyMs ?? '—'} ms avg
									</span>
								</article>
							</Card>
						);
					})}
					<Card asChild>
						<article className={`sla-card incident-summary ${openIncident ? 'has-incident' : ''}`}>
							<p>Current incident</p>
							<strong>{openIncident ? formatDuration(null, openIncident.startedAt) : 'None'}</strong>
							<span>{openIncident ? `Open since ${formatDate(openIncident.startedAt)}` : 'Everything is operational'}</span>
						</article>
					</Card>
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
							<Table className="min-w-150">
								<TableHeader>
									<TableRow>
										<TableHead>Status</TableHead>
										<TableHead>Response</TableHead>
										<TableHead>Latency</TableHead>
										<TableHead>Checked</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{checks.slice(0, 20).map((check) => (
										<TableRow key={check.id}>
											<TableCell>
												<Badge variant={check.ok ? 'online' : 'offline'}>{check.ok ? 'Up' : 'Down'}</Badge>
											</TableCell>
											<TableCell>
												<code className="max-w-65 truncate font-mono text-[11px]/[1.4] font-normal">
													{check.statusCode ? `HTTP ${check.statusCode}` : (check.error ?? 'Failed')}
												</code>
											</TableCell>
											<TableCell>{check.latencyMs} ms</TableCell>
											<TableCell>{formatDate(check.checkedAt)}</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
							{checks.length === 0 && (
								<Empty className="min-h-37.5 p-6">
									<EmptyTitle className="text-[13px]">No checks yet</EmptyTitle>
									<EmptyDescription>No checks recorded.</EmptyDescription>
								</Empty>
							)}
						</section>
					</section>
					<section className="data-panel incidents-panel">
						<div className="data-panel-heading">
							<div>
								<p className="overline">Downtime</p>
								<h2>Incidents</h2>
							</div>
							<span>{incidents.length} recorded</span>
						</div>
						{/* Keyboard focus makes this scrollable region accessible without a pointer. */}
						{/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
						<div className="incident-list" aria-label="Incident history" tabIndex={0}>
							{incidents.map((incident) => (
								<article className={incident.resolvedAt ? 'resolved' : 'open'} key={incident.id}>
									<span>{incident.resolvedAt ? <CheckCircle2 /> : <Clock3 />}</span>
									<div>
										<strong>{incident.resolvedAt ? 'Resolved incident' : 'Incident in progress'}</strong>
										<p>
											{incident.aiMessage ??
												incident.startError ??
												(incident.startStatusCode ? `HTTP ${incident.startStatusCode}` : 'Endpoint became unavailable')}
										</p>
										{incident.aiMessage && incident.startError && <small className="incident-raw">{incident.startError}</small>}
										<small>
											{formatDate(incident.startedAt)} · {formatDuration(incident.durationMs, incident.startedAt)}
										</small>
									</div>
								</article>
							))}
							{incidents.length === 0 && (
								<Empty className="min-h-37.5 p-6">
									<EmptyTitle className="text-[13px]">No incidents yet</EmptyTitle>
									<EmptyDescription>No downtime incidents recorded.</EmptyDescription>
								</Empty>
							)}
						</div>
					</section>
				</div>

				<section className="data-panel configuration-panel">
					<div className="data-panel-heading">
						<div>
							<p className="overline">Setup</p>
							<h2>Configuration</h2>
						</div>
						<Button variant="unstyled" className="secondary-button" type="button" onClick={() => setIsEditing(true)}>
							<Pencil /> Edit
						</Button>
					</div>
					<dl className="config-list">
						<div className="config-row">
							<dt>Method</dt>
							<dd>{monitor.method}</dd>
						</div>
						<div className="config-row">
							<dt>Expected status</dt>
							<dd>{monitor.expectedStatus}</dd>
						</div>
						<div className="config-row">
							<dt>Check interval</dt>
							<dd>{formatInterval(monitor.intervalSeconds)}</dd>
						</div>
						<div className="config-row">
							<dt>Timeout</dt>
							<dd>{monitor.timeoutMs.toLocaleString()} ms</dd>
						</div>
						<div className="config-row">
							<dt>Scheduled checks</dt>
							<dd className="config-row-actions">
								<span>{monitor.enabled ? 'Running' : 'Paused'}</span>
								<Button
									variant="unstyled"
									className="row-action"
									type="button"
									disabled={updateMutation.isPending}
									onClick={() => updateMutation.mutate({ id: monitor.id, input: { enabled: !monitor.enabled } })}
								>
									{monitor.enabled ? <PowerOff /> : <Power />}
									{monitor.enabled ? 'Pause' : 'Resume'}
								</Button>
							</dd>
						</div>
						<div className="config-row">
							<dt>Incident alerts</dt>
							<dd>{monitor.alertsEnabled ? 'Enabled' : 'Muted'}</dd>
						</div>
					</dl>
					<div className="config-danger">
						<p>This permanently deletes the monitor and its check history.</p>
						<Button variant="unstyled" className="danger-button" type="button" onClick={() => setIsConfirmingDelete(true)}>
							<Trash2 /> Delete monitor
						</Button>
					</div>
				</section>
			</main>
		</div>
	);
}
