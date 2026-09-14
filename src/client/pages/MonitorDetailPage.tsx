import { useState } from 'react';
import { ArrowLeft, BellOff, CheckCircle2, Clock3, ExternalLink, Pencil, Power, PowerOff, RefreshCw, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Empty, EmptyContent, EmptyDescription, EmptyTitle } from '@/components/ui/empty';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { AppHeader } from '../components/AppHeader';
import { LatencySparkline } from '../components/charts/LatencySparkline';
import { UptimeBar } from '../components/charts/UptimeBar';
import { DeleteMonitorDialog } from '../components/dashboard/DeleteMonitorDialog';
import { INTERVAL_OPTIONS, MonitorFormDialog } from '../components/dashboard/MonitorFormDialog';
import { formatDate, formatDuration } from '../lib/format';
import { monitorState } from '../lib/monitor-status';
import { navigate } from '../lib/router';
import { useSeo } from '../lib/seo';
import {
	useDeleteMonitorMutation,
	useMonitorChecksQuery,
	useMonitorIncidentsQuery,
	useMonitorQuery,
	useMonitorStatsQuery,
	useRunCheckMutation,
	useUpdateMonitorMutation,
} from '../queries/monitors';

const statusOrbVariants: Record<string, string> = {
	online:
		'border-status-online-border bg-primary-deep shadow-[0_0_0_8px_white] dark:border-brand/22 dark:bg-brand dark:shadow-[0_0_0_8px_var(--color-night-base),0_0_24px_rgb(62_207_142/0.38)]',
	offline:
		'border-status-offline-border bg-status-offline-bg shadow-[0_0_0_8px_white] dark:border-red-400/24 dark:bg-red-400 dark:shadow-[0_0_0_8px_var(--color-night-base),0_0_22px_rgb(248_113_113/0.32)]',
	pending:
		'border-status-pending-border bg-status-pending-bg shadow-[0_0_0_8px_white] dark:border-amber-500/24 dark:bg-status-pending-dark dark:shadow-[0_0_0_8px_var(--color-night-base),0_0_22px_rgb(245_158_11/0.28)]',
	checking:
		'border-status-checking-border bg-status-checking-bg shadow-[0_0_0_8px_white] dark:border-yellow-400/22 dark:bg-status-checking-dark dark:shadow-[0_0_0_8px_var(--color-night-base),0_0_22px_rgb(250_204_21/0.25)]',
};

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
	const openIncident = incidents.find((incident) => incident.resolvedAt === null);
	useSeo({ title: monitor ? `${monitor.name} — upwatch` : 'Monitor — upwatch', noindex: true });

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
	const status = monitorState(monitor);

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
			<main className="dashboard-main pt-8.5 dark:relative dark:isolate dark:before:pointer-events-none dark:before:absolute dark:before:-top-27.5 dark:before:left-1/2 dark:before:-z-1 dark:before:h-107.5 dark:before:w-[min(920px,92vw)] dark:before:-translate-x-1/2 dark:before:content-[''] dark:before:[background:radial-gradient(circle_at_35%_20%,rgb(62_207_142/0.075),transparent_45%),linear-gradient(90deg,rgb(255_255_255/0.018)_1px,transparent_1px),linear-gradient(rgb(255_255_255/0.018)_1px,transparent_1px)] dark:before:bg-size-[auto,44px_44px,44px_44px] dark:before:mask-[linear-gradient(to_bottom,black_0%,transparent_82%)] max-[520px]:dark:before:-top-20 max-[520px]:dark:before:h-82.5 max-[520px]:dark:before:bg-size-[auto,34px_34px,34px_34px]">
				<Button variant="unstyled" className="back-link" type="button" onClick={() => navigate('/dashboard')}>
					<ArrowLeft /> All monitors
				</Button>
				<section className="mt-8.5 flex flex-col items-start justify-between gap-8 border-b border-border-hero pb-9 min-[761px]:flex-row min-[761px]:items-end dark:border-white/9 dark:animate-monitor-enter">
					<div className="flex min-w-0 items-center gap-4.5 max-[520px]:items-start">
						<span className={cn('size-4 shrink-0 rounded-full border-4 max-[520px]:mt-2.75', statusOrbVariants[status.variant])} />
						<div>
							<p className="overline">Monitor #{monitor.id}</p>
							<h1 className="m-0 truncate text-display-sm font-medium leading-[1.1] tracking-display text-foreground min-[761px]:text-display dark:text-slate-50 dark:[text-shadow:0_1px_18px_rgb(0_0_0/0.22)]">
								{monitor.name}
							</h1>
							<a
								href={monitor.url}
								target="_blank"
								rel="noreferrer"
								className="mt-2.25 inline-flex max-w-[min(70vw,680px)] items-center gap-1.5 truncate font-mono text-caption/overline font-normal text-(--muted) hover:text-primary-deep dark:text-night-muted-text dark:hover:text-brand-soft"
							>
								{monitor.url}
								<ExternalLink className="size-3.25 shrink-0" />
							</a>
						</div>
					</div>
					<div className="flex items-center gap-4.5 max-[760px]:flex-wrap">
						<Badge variant={status.variant} title={status.detail ?? undefined}>
							{status.label}
						</Badge>
						{!monitor.alertsEnabled && (
							<span className="inline-flex items-center gap-1.5 text-micro text-(--muted) dark:text-night-muted-text">
								<BellOff className="size-3.5" /> Alerts muted
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

				<section
					className="mt-6 grid grid-cols-1 gap-3 min-[521px]:grid-cols-2 min-[761px]:grid-cols-3 min-[1001px]:grid-cols-5 dark:animate-monitor-enter dark:[animation-delay:45ms]"
					aria-label="Uptime windows"
				>
					{(['24h', '7d', '30d', '90d'] as const).map((key) => {
						const window = statsQuery.data?.windows[key];
						return (
							<Card asChild key={key}>
								<article className="min-w-0 rounded-md border border-border-card bg-white p-5 transition-[border-color,transform,box-shadow] duration-180 max-[520px]:p-4.5 dark:relative dark:border-white/8.5 dark:bg-[linear-gradient(145deg,var(--color-night-surface)_0%,var(--color-night-elevated)_100%)] dark:shadow-[0_10px_26px_rgb(0_0_0/0.22),inset_0_1px_rgb(255_255_255/0.035)] dark:before:absolute dark:before:-top-px dark:before:left-5 dark:before:h-px dark:before:w-8.5 dark:before:bg-brand/65 dark:before:content-[''] dark:hover:border-brand/24 dark:hover:-translate-y-0.5 dark:hover:shadow-[0_14px_34px_rgb(0_0_0/0.3),0_0_0_1px_rgb(62_207_142/0.035),inset_0_1px_rgb(255_255_255/0.05)]">
									<p className="m-0 mb-4.25 text-micro text-(--muted) dark:text-night-muted-text">{key} uptime</p>
									<strong className="block font-mono text-[23px]/none font-medium tracking-metric text-foreground dark:text-night-metric">
										{window?.uptimePct == null ? '—' : `${window.uptimePct.toFixed(3)}%`}
									</strong>
									<span className="mt-2.75 block truncate text-footnote text-faint dark:text-night-faint">
										{window?.totalChecks ?? 0} checks · {window?.avgLatencyMs ?? '—'} ms avg
									</span>
								</article>
							</Card>
						);
					})}
					<Card asChild>
						<article
							className={cn(
								'min-w-0 rounded-md border border-border-card p-5 transition-[border-color,transform,box-shadow] duration-180 max-[520px]:p-4.5 max-[760px]:min-[521px]:col-span-full',
								"dark:relative dark:border-white/8.5 dark:shadow-[0_10px_26px_rgb(0_0_0/0.22),inset_0_1px_rgb(255_255_255/0.035)] dark:before:absolute dark:before:-top-px dark:before:left-5 dark:before:h-px dark:before:w-8.5 dark:before:content-[''] dark:hover:border-brand/24 dark:hover:-translate-y-0.5 dark:hover:shadow-[0_14px_34px_rgb(0_0_0/0.3),0_0_0_1px_rgb(62_207_142/0.035),inset_0_1px_rgb(255_255_255/0.05)]",
								openIncident
									? 'border-incident-border bg-incident-bg dark:border-red-400/30 dark:bg-[linear-gradient(145deg,rgb(73_28_31/0.58),var(--color-night-incident)_100%)] dark:before:bg-red-400'
									: 'bg-surface-soft dark:bg-[linear-gradient(145deg,var(--color-night-card-alt)_0%,var(--color-night-panel)_100%)] dark:before:bg-slate-400/48',
							)}
						>
							<p className="m-0 mb-4.25 text-micro text-(--muted) dark:text-night-muted-text">Current incident</p>
							<strong
								className={cn(
									'block font-mono text-[23px]/none font-medium tracking-metric text-foreground dark:text-night-metric',
									openIncident ? 'text-incident-text dark:text-red-300' : '',
								)}
							>
								{openIncident ? formatDuration(null, openIncident.startedAt) : 'None'}
							</strong>
							<span className="mt-2.75 block truncate text-footnote text-faint dark:text-night-faint">
								{openIncident ? `Open since ${formatDate(openIncident.startedAt)}` : 'Everything is operational'}
							</span>
						</article>
					</Card>
				</section>

				<div className="mt-4 grid grid-cols-1 gap-4 min-[1001px]:grid-cols-[minmax(0,1.55fr)_minmax(300px,0.75fr)] dark:animate-monitor-enter dark:[animation-delay:90ms]">
					<section className="min-h-82.5 overflow-hidden rounded-md border border-border-subtle bg-white dark:border-white/8.5 dark:bg-night-panel dark:shadow-[0_16px_38px_rgb(0_0_0/0.27),inset_0_1px_rgb(255_255_255/0.03)]">
						<div className="flex min-h-20.5 items-center justify-between gap-5 border-b border-border-row p-[18px_22px] max-[520px]:p-4 dark:border-white/7.5 dark:bg-[linear-gradient(180deg,rgb(255_255_255/0.022),transparent)]">
							<div>
								<p className="overline mb-1.25">Response time</p>
								<h2 className="m-0 text-[18px] font-medium text-foreground dark:text-night-heading">Latency</h2>
							</div>
							<span className="font-mono text-footnote/overline font-normal text-faint dark:text-night-subtle-text">
								Last {checks.length} checks
							</span>
						</div>
						<LatencySparkline checks={checks} />
					</section>
					<section className="min-h-82.5 overflow-hidden rounded-md border border-border-subtle bg-white dark:border-white/8.5 dark:bg-night-panel dark:shadow-[0_16px_38px_rgb(0_0_0/0.27),inset_0_1px_rgb(255_255_255/0.03)]">
						<div className="flex min-h-20.5 items-center justify-between gap-5 border-b border-border-row p-[18px_22px] max-[520px]:p-4 dark:border-white/7.5 dark:bg-[linear-gradient(180deg,rgb(255_255_255/0.022),transparent)]">
							<div>
								<p className="overline mb-1.25">Availability</p>
								<h2 className="m-0 text-[18px] font-medium text-foreground dark:text-night-heading">Recent uptime</h2>
							</div>
							<span className="font-mono text-footnote/overline font-normal text-faint dark:text-night-subtle-text">
								{checks.filter((check) => check.ok).length}/{checks.length} successful
							</span>
						</div>
						<UptimeBar checks={checks} />
					</section>
				</div>

				<div className="mt-4 grid grid-cols-1 items-stretch gap-4 min-[1001px]:grid-cols-[minmax(0,1.55fr)_minmax(300px,0.75fr)] dark:animate-monitor-enter dark:[animation-delay:135ms]">
					<section className="flex h-full min-h-0 flex-col overflow-hidden rounded-md border border-border-subtle bg-white dark:border-white/8.5 dark:bg-night-panel dark:shadow-[0_16px_38px_rgb(0_0_0/0.27),inset_0_1px_rgb(255_255_255/0.03)]">
						<div className="flex min-h-20.5 items-center justify-between gap-5 border-b border-border-row p-[18px_22px] max-[520px]:p-4 dark:border-white/7.5 dark:bg-[linear-gradient(180deg,rgb(255_255_255/0.022),transparent)]">
							<div>
								<p className="overline mb-1.25">Event stream</p>
								<h2 className="m-0 text-[18px] font-medium text-foreground dark:text-night-heading">Recent checks</h2>
							</div>
							<span className="font-mono text-footnote/overline font-normal text-faint dark:text-night-subtle-text">
								{Math.min(checks.length, 20)} shown
							</span>
						</div>
						{/* Keyboard focus makes this horizontally scrollable region accessible without a pointer. */}
						{/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
						<section className="monitor-scroll overflow-x-auto" aria-label="Recent checks" tabIndex={0}>
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
										<TableRow key={check.id} className="transition-colors duration-140 dark:hover:bg-white/[0.022]">
											<TableCell>
												<Badge variant={check.ok ? 'online' : 'offline'}>{check.ok ? 'Up' : 'Down'}</Badge>
											</TableCell>
											<TableCell>
												<code className="max-w-select-max truncate font-mono text-footnote/overline font-normal dark:text-night-code">
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
									<EmptyTitle className="text-caption">No checks yet</EmptyTitle>
									<EmptyDescription>No checks recorded.</EmptyDescription>
								</Empty>
							)}
						</section>
					</section>
					<section className="flex h-full min-h-0 flex-col overflow-hidden rounded-md border border-border-subtle bg-white dark:border-white/8.5 dark:bg-night-panel dark:shadow-[0_16px_38px_rgb(0_0_0/0.27),inset_0_1px_rgb(255_255_255/0.03)]">
						<div className="flex min-h-20.5 items-center justify-between gap-5 border-b border-border-row p-[18px_22px] max-[520px]:p-4 dark:border-white/7.5 dark:bg-[linear-gradient(180deg,rgb(255_255_255/0.022),transparent)]">
							<div>
								<p className="overline mb-1.25">Downtime</p>
								<h2 className="m-0 text-[18px] font-medium text-foreground dark:text-night-heading">Incidents</h2>
							</div>
							<span className="font-mono text-footnote/overline font-normal text-faint dark:text-night-subtle-text">
								{incidents.length} recorded
							</span>
						</div>
						{/* Keyboard focus makes this scrollable region accessible without a pointer. */}
						{/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
						<div className="monitor-scroll min-h-0" aria-label="Incident history" tabIndex={0}>
							{incidents.map((incident) => (
								<article
									key={incident.id}
									className="flex gap-3.25 p-[18px_20px] not-first:border-t not-first:border-border-row transition-colors duration-140 dark:not-first:border-white/6.5 dark:hover:bg-white/[0.022]"
								>
									<span
										className={cn(
											'grid size-7.5 shrink-0 place-items-center rounded-full [&>svg]:size-3.75',
											incident.resolvedAt
												? 'bg-incident-resolved-bg text-accent-green-hover dark:bg-brand/10.5 dark:text-brand-soft dark:shadow-[inset_0_0_0_1px_rgb(62_207_142/0.12)]'
												: 'bg-incident-active-bg text-incident-active-text dark:bg-red-400/10 dark:text-red-400 dark:shadow-[inset_0_0_0_1px_rgb(248_113_113/0.14)]',
										)}
									>
										{incident.resolvedAt ? <CheckCircle2 /> : <Clock3 />}
									</span>
									<div className="min-w-0">
										<button
											type="button"
											className="group inline-flex cursor-pointer items-center gap-2.5 border-0 bg-transparent p-0 text-inherit"
											onClick={() => navigate(`/incidents/${incident.id}`)}
										>
											<strong className="text-caption font-medium text-foreground transition-colors group-hover:text-brand-deep dark:text-night-title dark:group-hover:text-brand-soft">
												{incident.title ?? (incident.resolvedAt ? 'Resolved incident' : 'Incident in progress')}
											</strong>
											<Badge variant={incident.resolvedAt ? 'online' : 'offline'}>{incident.status}</Badge>
										</button>
										<p className="my-1.5 mb-1.5 mt-1 break-all text-micro leading-alert text-(--muted) dark:text-gray-400">
											{incident.latestUpdate?.body ??
												incident.startError ??
												(incident.startStatusCode ? `HTTP ${incident.startStatusCode}` : 'Endpoint became unavailable')}
										</p>
										{incident.latestUpdate && incident.startError && (
											<small className="-mt-px mb-1.25 block break-all font-mono text-2xs/overline text-ink-faint-alt dark:text-night-faint-alt">
												{incident.startError}
											</small>
										)}
										<small className="font-mono text-2xs/overline text-ink-faint-alt dark:text-night-faint-alt">
											{formatDate(incident.startedAt)} · {formatDuration(incident.durationMs, incident.startedAt)}
										</small>
									</div>
								</article>
							))}
							{incidents.length === 0 && (
								<Empty className="min-h-37.5 p-6">
									<EmptyTitle className="text-caption">No incidents yet</EmptyTitle>
									<EmptyDescription>No downtime incidents recorded.</EmptyDescription>
								</Empty>
							)}
						</div>
					</section>
				</div>

				<section className="mt-4 overflow-hidden rounded-md border border-border-subtle bg-white dark:border-white/8.5 dark:bg-night-panel dark:shadow-[0_16px_38px_rgb(0_0_0/0.27),inset_0_1px_rgb(255_255_255/0.03)] dark:animate-monitor-enter dark:[animation-delay:180ms]">
					<div className="flex min-h-20.5 items-center justify-between gap-5 border-b border-border-row p-[18px_22px] max-[520px]:p-4 dark:border-white/7.5 dark:bg-[linear-gradient(180deg,rgb(255_255_255/0.022),transparent)]">
						<div>
							<p className="overline mb-1.25">Setup</p>
							<h2 className="m-0 text-[18px] font-medium text-foreground dark:text-night-heading">Configuration</h2>
						</div>
						<Button variant="unstyled" className="secondary-button" type="button" onClick={() => setIsEditing(true)}>
							<Pencil /> Edit
						</Button>
					</div>
					<dl className="m-0">
						<div className="flex items-center justify-between gap-5 border-b border-border-divider p-[14px_22px] transition-colors duration-140 max-[760px]:flex-wrap dark:border-white/6.5 dark:hover:bg-white/[0.018]">
							<dt className="text-micro text-(--muted) dark:text-night-muted-text">Method</dt>
							<dd className="m-0 font-mono text-caption/overline font-normal text-ink dark:text-night-body">{monitor.method}</dd>
						</div>
						<div className="flex items-center justify-between gap-5 border-b border-border-divider p-[14px_22px] transition-colors duration-140 max-[760px]:flex-wrap dark:border-white/6.5 dark:hover:bg-white/[0.018]">
							<dt className="text-micro text-(--muted) dark:text-night-muted-text">Expected status</dt>
							<dd className="m-0 font-mono text-caption/overline font-normal text-ink dark:text-night-body">{monitor.expectedStatus}</dd>
						</div>
						<div className="flex items-center justify-between gap-5 border-b border-border-divider p-[14px_22px] transition-colors duration-140 max-[760px]:flex-wrap dark:border-white/6.5 dark:hover:bg-white/[0.018]">
							<dt className="text-micro text-(--muted) dark:text-night-muted-text">Check interval</dt>
							<dd className="m-0 font-mono text-caption/overline font-normal text-ink dark:text-night-body">
								{formatInterval(monitor.intervalSeconds)}
							</dd>
						</div>
						<div className="flex items-center justify-between gap-5 border-b border-border-divider p-[14px_22px] transition-colors duration-140 max-[760px]:flex-wrap dark:border-white/6.5 dark:hover:bg-white/[0.018]">
							<dt className="text-micro text-(--muted) dark:text-night-muted-text">Timeout</dt>
							<dd className="m-0 font-mono text-caption/overline font-normal text-ink dark:text-night-body">
								{monitor.timeoutMs.toLocaleString()} ms
							</dd>
						</div>
						<div className="flex items-center justify-between gap-5 border-b border-border-divider p-[14px_22px] transition-colors duration-140 max-[760px]:flex-wrap dark:border-white/6.5 dark:hover:bg-white/[0.018]">
							<dt className="text-micro text-(--muted) dark:text-night-muted-text">Scheduled checks</dt>
							<dd className="m-0 flex items-center gap-3 font-sans">
								<Badge variant={monitor.enabled ? 'online' : 'pending'}>{monitor.enabled ? 'Running' : 'Paused'}</Badge>
								<Button
									variant="outline"
									size="sm"
									type="button"
									disabled={updateMutation.isPending}
									onClick={() => updateMutation.mutate({ id: monitor.id, input: { enabled: !monitor.enabled } })}
									className="h-7 gap-1.5 px-2.5 font-sans text-xs font-medium text-ink transition-colors hover:border-neutral-400 dark:border-white/12 dark:bg-white/4 dark:text-night-body dark:hover:border-white/25 dark:hover:bg-white/8"
								>
									{updateMutation.isPending ? (
										<RefreshCw className="size-3.5 animate-spin" />
									) : monitor.enabled ? (
										<PowerOff className="size-3.5" />
									) : (
										<Power className="size-3.5 text-brand-deep dark:text-brand-soft" />
									)}
									{updateMutation.isPending ? 'Updating…' : monitor.enabled ? 'Pause' : 'Resume'}
								</Button>
							</dd>
						</div>
						<div className="flex items-center justify-between gap-5 p-[14px_22px] transition-colors duration-140 max-[760px]:flex-wrap dark:hover:bg-white/[0.018]">
							<dt className="text-micro text-(--muted) dark:text-night-muted-text">Incident alerts</dt>
							<dd className="m-0 font-mono text-caption/overline font-normal text-ink dark:text-night-body">
								{monitor.alertsEnabled ? 'Enabled' : 'Muted'}
							</dd>
						</div>
					</dl>
					<div className="flex items-center justify-between gap-4 border-t border-border-row bg-surface-danger-subtle p-[16px_22px] max-[760px]:flex-col max-[760px]:items-start dark:border-t-red-400/14 dark:bg-night-muted dark:bg-[linear-gradient(90deg,rgb(127_29_29/0.11),transparent_52%)]">
						<p className="m-0 text-micro text-(--muted) dark:text-night-muted-text">
							This permanently deletes the monitor and its check history.
						</p>
						<Button variant="unstyled" className="danger-button" type="button" onClick={() => setIsConfirmingDelete(true)}>
							<Trash2 /> Delete monitor
						</Button>
					</div>
				</section>
			</main>
		</div>
	);
}
