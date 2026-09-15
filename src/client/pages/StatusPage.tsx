import { useEffect, useState } from 'react';
import {
	Activity,
	ChevronRight,
	CircleCheck,
	Database,
	History,
	LayoutDashboard,
	LogIn,
	RefreshCw,
	TriangleAlert,
	Wrench,
	Zap,
} from 'lucide-react';
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { PublicOverallStatus, PublicServiceStatus } from '../api/status';
import { SiteIcon } from '../components/SiteIcon';
import { StatusHistoryBar } from '../components/StatusHistoryBar';
import { ThemeToggle } from '../components/ThemeToggle';
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

const BANNER_STYLES: Record<PublicOverallStatus, { banner: string; icon: string }> = {
	operational: {
		banner:
			'border-banner-operational-border text-banner-operational-text bg-linear-to-r from-banner-operational-from to-banner-operational-to shadow-banner-operational dark:border-brand/25 dark:text-brand-soft dark:bg-linear-to-r dark:from-brand/12 dark:via-brand-deep/5 dark:to-night-banner-operational/60 dark:shadow-banner-operational-dark',
		icon: 'border-brand-deep/22 dark:border-brand/30 dark:bg-night-banner-operational/75',
	},
	degraded: {
		banner:
			'border-banner-degraded-border text-banner-degraded-text bg-linear-to-r from-banner-degraded-from to-banner-degraded-to shadow-banner-degraded dark:border-banner-degraded-dark-border dark:text-banner-degraded-dark-text dark:bg-linear-to-r dark:from-banner-degraded-dark-from dark:via-banner-degraded-dark-via dark:to-banner-degraded-dark-to dark:shadow-banner-degraded-dark',
		icon: 'border-banner-degraded-icon-border dark:border-banner-degraded-dark-icon-border dark:bg-banner-degraded-dark-icon-bg',
	},
	down: {
		banner:
			'border-banner-down-border text-banner-down-text bg-linear-to-r from-danger-bg to-banner-down-to shadow-banner-down dark:border-chart-down/35 dark:text-red-400 dark:bg-linear-to-r dark:from-chart-down/14 dark:via-banner-down-dark-via dark:to-banner-down-dark-to dark:shadow-banner-down-dark',
		icon: 'border-banner-down-icon-border dark:border-chart-down/35 dark:bg-banner-down-dark-icon-bg',
	},
};

const IMPACT_TONE_STYLES: Record<string, string> = {
	critical:
		'border-tone-critical-border bg-tone-critical-bg text-tone-critical-text dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400',
	major: 'border-tone-major-border bg-tone-major-bg text-tone-major-text dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400',
	minor:
		'border-tone-minor-border bg-tone-minor-bg text-tone-minor-text dark:border-yellow-500/30 dark:bg-yellow-500/10 dark:text-yellow-400',
	none: 'border-border-card bg-tone-none-bg text-muted-text dark:border-white/12 dark:bg-white/4 dark:text-neutral-400',
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
			<header className="relative z-20 border-b border-border-row bg-white/94 backdrop-blur-header dark:border-white/8 dark:bg-night-root/85 dark:backdrop-blur-md">
				<div className="mx-auto flex h-17 w-[min(var(--spacing-status-max),calc(100%-48px))] max-tablet:w-[min(var(--spacing-status-max),calc(100%-32px))] max-mobile:h-15.5 items-center justify-between">
					<a className="brand" href="/" aria-label="Upwatch public status">
						<Zap className="brand-mark" fill="currentColor" />
						<span>upwatch</span>
					</a>
					<div className="flex items-center gap-2 [&_.app-nav-icon]:dark:text-neutral-400 [&_.app-nav-icon:hover:not(:disabled)]:dark:text-brand [&_.app-nav-icon:hover:not(:disabled)]:dark:bg-brand/12">
						<ThemeToggle className="app-nav-icon" />
						<TooltipProvider>
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										variant="ghost"
										size="icon"
										className="app-nav-icon"
										type="button"
										aria-label={sessionQuery.data?.authenticated ? 'Dashboard' : 'Sign in'}
										onClick={() => navigate(sessionQuery.data?.authenticated ? '/dashboard' : '/login')}
									>
										{sessionQuery.data?.authenticated ? <LayoutDashboard aria-hidden="true" /> : <LogIn aria-hidden="true" />}
									</Button>
								</TooltipTrigger>
								<TooltipContent sideOffset={6}>{sessionQuery.data?.authenticated ? 'Dashboard' : 'Sign in'}</TooltipContent>
							</Tooltip>
						</TooltipProvider>
					</div>
				</div>
			</header>

			<main className="mx-auto w-[min(var(--spacing-status-max),calc(100%-48px))] max-tablet:w-[min(var(--spacing-status-max),calc(100%-32px))] py-18 pb-14 max-tablet:py-13 max-tablet:pb-11">
				<section className="max-w-155">
					<p className="overline dark:text-brand-soft">System status</p>
					<h1 className="m-0 text-hero-status font-medium leading-hero tracking-hero max-mobile:tracking-hero-mobile dark:text-neutral-50">
						Service availability
					</h1>
					<p className="mt-4.5 max-w-140 text-subtitle leading-body-relaxed text-muted-foreground dark:text-neutral-400">
						Live operational health and 90-day availability for every public service.
					</p>
				</section>

				{statusQuery.isPending ? (
					<div className="mt-10.5" aria-busy="true" aria-label="Loading service status">
						<div className="h-29 rounded-card bg-skeleton-banner bg-size-[220%_100%] animate-skeleton dark:bg-skeleton-banner-dark" />
						<div className="mt-4.5 overflow-hidden rounded-card border border-border-skeleton bg-white dark:border-white/8 dark:bg-night-panel">
							{[0, 1, 2].map((item) => (
								<div
									key={item}
									className="flex flex-wrap items-center gap-4 p-5.5 not-first:border-t not-first:border-border-row dark:not-first:border-white/6"
								>
									<i className="block size-10.5 shrink-0 rounded-badge bg-skeleton-item bg-size-[220%_100%] animate-skeleton dark:bg-skeleton-item-dark" />
									<span className="block h-8.5 w-[min(220px,75%)] rounded-badge bg-skeleton-item bg-size-[220%_100%] animate-skeleton dark:bg-skeleton-item-dark" />
									<b className="block h-8 w-full rounded-badge bg-skeleton-item bg-size-[220%_100%] animate-skeleton dark:bg-skeleton-item-dark" />
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
						<section
							className={`mt-10.5 grid min-h-29 grid-cols-[auto_1fr_auto] items-center gap-4.5 rounded-card border p-6 px-panel-x animate-enter max-tablet:grid-cols-[auto_1fr] max-mobile:grid-cols-1 max-mobile:gap-3 max-mobile:p-5 max-mobile:py-5.5 ${BANNER_STYLES[status.overall].banner}`}
							aria-live="polite"
						>
							<span
								className={`grid size-11.5 max-mobile:size-10 place-items-center rounded-full border bg-white/72 [&>svg]:size-5.25 ${BANNER_STYLES[status.overall].icon}`}
							>
								<OverallIcon status={status.overall} />
							</span>
							<div>
								<h2 className="m-0 text-lg font-semibold tracking-card-heading dark:text-neutral-50">
									{OVERALL_COPY[status.overall].title}
								</h2>
								<p className="mt-1.5 text-xs text-inherit opacity-75 dark:opacity-88">{OVERALL_COPY[status.overall].detail}</p>
							</div>
							<time
								className="justify-self-end font-mono text-2xs leading-overline opacity-66 max-tablet:col-start-2 max-tablet:justify-self-start max-mobile:col-auto dark:opacity-75 whitespace-nowrap"
								dateTime={new Date(status.updatedAt).toISOString()}
							>
								{relativeUpdate(status.updatedAt, now)}
							</time>
						</section>

						{maintenanceServices.length > 0 && (
							<section
								className="mt-4.5 overflow-hidden rounded-card border border-maintenance-card-border bg-white shadow-maintenance-card animate-enter dark:border-maintenance-blue/25 dark:bg-night-card dark:shadow-[0_16px_40px_rgba(0,0,0,0.4)]"
								aria-labelledby="scheduled-maintenance-title"
								aria-live="polite"
							>
								<header className="flex min-h-23 items-center justify-between gap-6 border-b border-maintenance-header-border bg-linear-to-r from-maintenance-gradient-from via-maintenance-gradient-via to-white p-4.5 px-5.5 max-mobile:flex-col max-mobile:items-start max-mobile:gap-3.5 max-mobile:p-4 dark:border-white/7 dark:bg-linear-to-r dark:from-maintenance-icon/12 dark:via-none dark:to-night-card/80">
									<div className="flex items-center gap-3.5">
										<span className="grid size-10 shrink-0 place-items-center rounded-lg border border-maintenance-icon/20 bg-white/82 text-maintenance-icon [&>svg]:size-4.5 dark:border-maintenance-blue/30 dark:bg-maintenance-icon/15 dark:text-maintenance-blue-light">
											<Wrench aria-hidden="true" />
										</span>
										<div>
											<p className="m-0 mb-0.75 font-mono text-3xs font-medium uppercase tracking-overline text-maintenance-overline dark:text-maintenance-overline-dark">
												Scheduled maintenance
											</p>
											<h2
												id="scheduled-maintenance-title"
												className="m-0 text-card-title font-semibold tracking-card-heading text-maintenance-title dark:text-maintenance-title-dark"
											>
												Planned service work is in progress
											</h2>
										</div>
									</div>
									<span className="rounded-badge border border-maintenance-badge-border bg-white/72 px-2 py-1.25 font-mono text-3xs font-medium text-maintenance-badge-text max-mobile:ml-13.5 dark:border-maintenance-blue/25 dark:bg-maintenance-icon/12 dark:text-maintenance-badge-text-dark">
										{maintenanceServices.length} {maintenanceServices.length === 1 ? 'service' : 'services'}
									</span>
								</header>
								<div className="flex flex-col">
									{maintenanceServices.map((service) => (
										<article
											className="flex min-h-22 items-center justify-between gap-6 p-4.5 px-5.5 not-first:border-t not-first:border-maintenance-row-border max-mobile:flex-col max-mobile:items-start max-mobile:gap-3.5 max-mobile:p-4 dark:not-first:border-white/6"
											key={service.id}
										>
											<div className="flex items-center gap-3.5">
												<span className="grid size-9 shrink-0 place-items-center rounded-card-sm border border-maintenance-icon-box-border bg-maintenance-icon-box-bg [&>img]:size-5 [&>img]:object-contain dark:border-white/8 dark:bg-night-maintenance-icon">
													<SiteIcon monitorId={service.id} favicon="public" />
												</span>
												<div>
													<strong className="block text-caption dark:text-neutral-100">{service.name}</strong>
													<span className="mt-1 block text-xs text-muted-foreground dark:text-neutral-400">
														{service.maintenance?.name}
													</span>
												</div>
											</div>
											<span className="font-mono text-2xs font-medium text-maintenance-icon whitespace-nowrap max-mobile:ml-12.5 dark:text-maintenance-blue-light">
												<i className="mr-1.25 inline-block size-1.75 rounded-full bg-maintenance-blue" /> until{' '}
												{maintenanceTime.format(new Date(service.maintenance!.endsAt))}
											</span>
										</article>
									))}
								</div>
							</section>
						)}

						{activeIncidents.length > 0 && (
							<section
								className="mt-4.5 overflow-hidden rounded-card border border-active-incident-border bg-white shadow-active-incident animate-enter dark:border-red-400/28 dark:bg-night-danger dark:shadow-[0_16px_40px_rgba(0,0,0,0.4)]"
								aria-labelledby="active-incidents-title"
								aria-live="polite"
							>
								<header className="flex min-h-23 items-center justify-between gap-6 border-b border-active-incident-header-border bg-linear-to-r from-active-incident-from via-active-incident-via to-white p-4.5 px-5.5 max-mobile:flex-col max-mobile:items-start max-mobile:gap-3.5 max-mobile:p-4 dark:border-red-400/18 dark:bg-linear-to-r dark:from-red-400/12 dark:via-none dark:to-night-danger/80">
									<div className="flex items-center gap-3.5">
										<span className="grid size-10 shrink-0 place-items-center rounded-lg border border-red-700/20 bg-white/82 text-tone-critical-text shadow-active-incident-icon [&>svg]:size-4.5 dark:border-red-400/30 dark:bg-red-400/12 dark:text-red-400 dark:shadow-none">
											<TriangleAlert aria-hidden="true" />
										</span>
										<div>
											<p className="m-0 mb-0.75 font-mono text-3xs font-medium uppercase tracking-overline text-active-incident-overline dark:text-red-400">
												Active incident
											</p>
											<h2
												id="active-incidents-title"
												className="m-0 text-card-title font-semibold tracking-card-heading text-active-incident-title dark:text-red-100"
											>
												We’re working to restore service
											</h2>
										</div>
									</div>
									<span className="shrink-0 rounded-badge border border-active-incident-badge-border bg-white/72 px-2 py-1.25 font-mono text-3xs font-medium text-active-incident-badge-text max-mobile:ml-13.5 dark:border-red-400/30 dark:bg-red-400/10 dark:text-red-300">
										{activeIncidents.length} {activeIncidents.length === 1 ? 'incident' : 'incidents'} active
									</span>
								</header>

								<div className="flex flex-col">
									{activeIncidents.map((incident) => (
										<article
											className="grid min-h-skeleton-h grid-cols-[minmax(190px,0.55fr)_minmax(320px,1.25fr)_auto] items-center gap-6 p-5 px-5.5 not-first:border-t not-first:border-active-incident-row-border max-tablet:grid-cols-[minmax(180px,0.55fr)_minmax(0,1fr)] max-tablet:gap-4.5 max-mobile:grid-cols-1 max-mobile:gap-3.5 max-mobile:p-4 dark:not-first:border-white/6"
											key={incident.id}
										>
											<div className="flex min-w-0 items-center gap-3">
												<span className="grid size-9 shrink-0 place-items-center rounded-card-sm border border-active-incident-icon-border bg-active-incident-icon-bg text-active-incident-icon-text [&>svg]:size-4.25 [&>img]:size-5 [&>img]:rounded-xs [&>img]:object-contain dark:border-red-400/22 dark:bg-red-400/8 dark:text-red-400">
													<TriangleAlert />
												</span>
												<div className="min-w-0">
													<button
														className="cursor-pointer border-0 bg-transparent p-0 text-left"
														type="button"
														onClick={() => navigate(`/incidents/${incident.id}`)}
													>
														<strong className="block truncate text-sm font-semibold text-ink-heading-dark hover:underline dark:text-neutral-50">
															{incident.title}
														</strong>
													</button>
													<span className="mt-0.75 block truncate text-2xs text-active-incident-subtext dark:text-neutral-400">
														{incident.services.length
															? incident.services.map((service) => service.name).join(', ')
															: 'General service incident'}
													</span>
												</div>
											</div>
											<p className="m-0 max-w-[66ch] text-xs leading-body-relaxed text-pretty text-active-incident-body max-mobile:pl-12 dark:text-neutral-300">
												{incident.latestUpdate?.body}
											</p>
											<span className="inline-flex items-center gap-1.75 justify-self-end whitespace-nowrap font-mono text-3xs font-medium text-active-incident-meta max-tablet:col-start-2 max-tablet:justify-self-start max-mobile:col-auto max-mobile:ml-12 dark:text-red-400">
												<i className="size-1.5 rounded-full bg-chart-down shadow-pulse-down animate-blink" /> {incident.status}
											</span>
										</article>
									))}
								</div>
							</section>
						)}

						<section
							className="mt-4.5 overflow-hidden rounded-card border border-border-subtle bg-white shadow-card-elevated-green animate-enter dark:border-white/8 dark:bg-night-panel dark:shadow-incident-detail-dark"
							aria-labelledby="public-services-title"
						>
							<div className="flex min-h-22 items-center justify-between gap-6 border-b border-border-heading p-4.5 px-5.5 max-mobile:p-4 max-mobile:py-4.25 dark:border-white/7">
								<div>
									<h2 id="public-services-title" className="m-0 text-lg font-medium dark:text-neutral-50">
										Services
									</h2>
									<p className="mt-1.25 text-xs text-muted-foreground max-mobile:max-w-62.5 dark:text-neutral-400">
										Availability is calculated from checks collected over the last 90 days.
									</p>
								</div>
								<Button
									variant="unstyled"
									className="icon-button max-mobile:size-11 max-mobile:shrink-0 dark:border-white/12 dark:bg-white/4 dark:text-neutral-400 hover:not-disabled:dark:border-brand/35 hover:not-disabled:dark:bg-brand/8 hover:not-disabled:dark:text-brand"
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
								<div className="flex flex-col">
									{status.services.map((service) => {
										const serviceStatus = SERVICE_STATUS[service.status];
										return (
											<article
												className="flex flex-col gap-4 p-5.5 not-first:border-t not-first:border-border-row hover:bg-surface-dialog-header max-mobile:p-4 max-mobile:py-5 dark:bg-transparent dark:not-first:border-white/6 dark:hover:bg-white/2"
												key={service.id}
											>
												<div className="flex items-center justify-between gap-4 max-mobile:gap-3">
													<div className="flex flex-1 items-center gap-3.5 min-w-0 [&_.service-icon]:dark:border-white/8 [&_.service-icon]:dark:bg-night-icon [&_.service-icon]:dark:text-neutral-400">
														<span className="service-icon">
															<SiteIcon monitorId={service.id} favicon="public" />
														</span>
														<div className="flex flex-1 items-center gap-5 min-w-0">
															<strong className="truncate text-item font-medium min-w-0 dark:text-neutral-50">{service.name}</strong>
															<Badge className="shrink-0" variant={serviceStatus.className}>
																{serviceStatus.label}
															</Badge>
														</div>
													</div>
													<div className="shrink-0 text-right whitespace-nowrap">
														<span className="block text-2xs text-faint dark:text-neutral-400">90-day uptime</span>
														<strong className="mt-1.25 block font-mono text-card-title font-medium leading-tight-md tracking-metric-compact max-mobile:text-item dark:text-neutral-100">
															{service.uptime90d === null ? '—' : `${service.uptime90d.toFixed(1)}%`}
														</strong>
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
							<section
								className="mt-4.5 overflow-hidden rounded-card border border-border-subtle bg-white shadow-card-elevated-green animate-enter dark:border-white/8 dark:bg-night-panel dark:shadow-incident-detail-dark"
								aria-labelledby="past-incidents-title"
							>
								<header className="flex min-h-23 items-center justify-between gap-6 border-b border-past-incidents-header-border bg-linear-to-r from-past-incidents-from via-past-incidents-via to-white p-4.5 px-5.5 max-mobile:flex-col max-mobile:items-start max-mobile:gap-3.5 max-mobile:p-4 dark:border-white/7 dark:bg-linear-to-r dark:from-brand/7 dark:via-none dark:to-night-panel/80">
									<div className="flex items-center gap-3.5">
										<span className="grid size-10 shrink-0 place-items-center rounded-lg border border-brand-deep/18 bg-white/82 text-accent-green-hover [&>svg]:size-4.5 dark:border-brand/30 dark:bg-brand/10 dark:text-brand">
											<History aria-hidden="true" />
										</span>
										<div>
											<p className="m-0 mb-0.75 font-mono text-3xs font-medium uppercase tracking-overline text-past-incidents-accent dark:text-brand-soft">
												Last 30 days
											</p>
											<h2
												id="past-incidents-title"
												className="m-0 text-card-title font-semibold tracking-card-heading text-past-incidents-title dark:text-neutral-50"
											>
												Past incidents
											</h2>
										</div>
									</div>
									<span className="shrink-0 rounded-badge border border-past-incidents-badge-border bg-white/72 px-2 py-1.25 font-mono text-3xs font-medium text-past-incidents-accent max-mobile:ml-13.5 dark:border-brand/25 dark:bg-brand/8 dark:text-brand-soft">
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
									<div className="flex flex-col">
										{pastIncidents.map((incident) => {
											const impact = INCIDENT_IMPACT[incident.impact] ?? INCIDENT_IMPACT.none;
											return (
												<button
													className="group grid w-full cursor-pointer grid-cols-[auto_1fr_auto] items-start gap-3.5 border-0 bg-transparent p-4.5 px-5.5 text-left font-inherit not-first:border-t not-first:border-border-row hover:bg-surface-dialog-header focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-deep/45 max-mobile:p-4 dark:not-first:border-white/6 dark:hover:bg-white/2 dark:focus-visible:outline-brand/50"
													key={incident.id}
													type="button"
													onClick={() => navigate(`/incidents/${incident.id}`)}
												>
													<span className="grid size-7.5 shrink-0 place-items-center rounded-full bg-incident-resolved-bg text-accent-green-hover [&>svg]:size-3.75 dark:bg-brand/12 dark:text-brand">
														<CircleCheck aria-hidden="true" />
													</span>
													<span className="grid min-w-0 gap-1">
														<span className="flex flex-wrap items-center gap-2.5">
															<strong className="text-sm font-semibold text-ink-heading-dark dark:text-neutral-100">
																{incident.title}
															</strong>
															<span
																className={`rounded-badge border px-1.75 py-0.75 font-mono text-3xs font-medium uppercase tracking-tag ${IMPACT_TONE_STYLES[impact.tone] ?? IMPACT_TONE_STYLES.none}`}
															>
																{impact.label}
															</span>
														</span>
														<span className="block truncate text-2xs text-muted-foreground dark:text-neutral-400">
															{incident.services.length
																? incident.services.map((service) => service.name).join(', ')
																: 'General service incident'}
														</span>
														{incident.latestUpdate?.body && (
															<span className="mt-0.5 line-clamp-2 max-tablet:line-clamp-3 max-w-[72ch] text-xs leading-subtitle text-muted-foreground dark:text-neutral-400">
																{incident.latestUpdate.body}
															</span>
														)}
														<span className="mt-0.5 block font-mono text-2xs leading-overline text-faint dark:text-faint [&>i]:mx-1.5 [&>i]:not-italic [&>i]:opacity-55">
															<time dateTime={incident.startedAt}>{formatDate(incident.startedAt)}</time>
															<i aria-hidden="true">·</i> down {formatDuration(incident.durationMs ?? null, incident.startedAt)}
															{incident.resolvedAt && (
																<>
																	<i aria-hidden="true">·</i> resolved {resolvedTime.format(new Date(incident.resolvedAt))}
																</>
															)}
														</span>
													</span>
													<ChevronRight
														className="size-4 self-center text-arrow-muted transition-colors group-hover:text-arrow-hover max-mobile:hidden dark:text-neutral-600 dark:group-hover:text-neutral-400"
														aria-hidden="true"
													/>
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

			<footer className="mx-auto flex w-[min(var(--spacing-status-max),calc(100%-48px))] max-tablet:w-[min(var(--spacing-status-max),calc(100%-32px))] items-center justify-between border-t border-border-footer py-7 pb-9 text-footnote text-ink-footer max-mobile:flex-col max-mobile:items-start max-mobile:gap-2 dark:border-white/8 dark:text-faint">
				<span>Powered by upwatch</span>
				<span className="inline-flex items-center gap-1.75">
					<i className="size-1.5 rounded-full bg-brand-deep shadow-brand-dot dark:bg-brand dark:shadow-brand-dot-dark" /> Monitoring from
					Cloudflare's edge
				</span>
			</footer>
		</div>
	);
}
