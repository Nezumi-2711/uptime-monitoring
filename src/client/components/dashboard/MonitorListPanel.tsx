import { AlertTriangle, ArrowRight, Database, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { cn } from '@/lib/utils';
import { monitorState, uptimeWindows } from '../../lib/monitor-status';
import { navigate } from '../../lib/router';
import { useMonitorsQuery } from '../../queries/monitors';
import { useStatusQuery } from '../../queries/status';
import { SiteIcon } from '../SiteIcon';

type MonitorListPanelProps = {
	formOpen: boolean;
	onAddMonitor: () => void;
};

function formatCheckedAt(value: string | null) {
	if (!value) return 'Not checked yet';
	return new Intl.DateTimeFormat('en', {
		dateStyle: 'medium',
		timeStyle: 'short',
	}).format(new Date(value));
}

function errorMessage(error: unknown, fallback: string) {
	return error instanceof Error ? error.message : fallback;
}

export function MonitorListPanel({ formOpen, onAddMonitor }: MonitorListPanelProps) {
	const monitorsQuery = useMonitorsQuery();
	const statusQuery = useStatusQuery();
	const monitors = monitorsQuery.data?.monitors ?? [];
	const servicesById = new Map(statusQuery.data?.services.map((service) => [service.id, service]) ?? []);

	return (
		<section
			className="mt-6 overflow-hidden rounded-md border border-border-subtle bg-white dark:border-white/8 dark:bg-night-panel dark:shadow-[0_16px_40px_rgba(0,0,0,0.35)]"
			aria-labelledby="monitor-list-title"
		>
			<div className="panel-heading">
				<div>
					<h2 id="monitor-list-title">Configured sites</h2>
					<p>Latest result for each monitored endpoint.</p>
				</div>
				<Button
					variant="unstyled"
					className="icon-button"
					type="button"
					onClick={() => void monitorsQuery.refetch()}
					disabled={monitorsQuery.isFetching}
					aria-label="Refresh monitors"
				>
					<RefreshCw className={monitorsQuery.isFetching ? 'is-spinning' : ''} />
				</Button>
			</div>

			{monitorsQuery.isPending ? (
				<div aria-label="Loading monitors">
					{[0, 1, 2].map((item) => (
						<div
							key={item}
							className="grid min-h-skeleton-h grid-cols-[40px_1fr_180px] items-center gap-4 px-5 py-4.5 not-first:border-t not-first:border-border-row dark:not-first:border-white/6"
						>
							<i className="block size-10 rounded-[5px] bg-neutral-200 animate-pulse dark:bg-neutral-800" />
							<span className="block h-8 w-[min(360px,80%)] rounded-[5px] bg-neutral-200 animate-pulse dark:bg-neutral-800" />
							<b className="block h-8 w-45 rounded-[5px] bg-neutral-200 animate-pulse dark:bg-neutral-800" />
						</div>
					))}
				</div>
			) : monitorsQuery.isError ? (
				<Empty variant="error">
					<EmptyMedia variant="icon">
						<AlertTriangle />
					</EmptyMedia>
					<EmptyTitle>Monitors could not be loaded</EmptyTitle>
					<EmptyDescription>{errorMessage(monitorsQuery.error, 'Unknown request error')}</EmptyDescription>
					<EmptyContent>
						<Button variant="unstyled" className="secondary-button" type="button" onClick={() => void monitorsQuery.refetch()}>
							Try again
						</Button>
					</EmptyContent>
				</Empty>
			) : monitors.length === 0 ? (
				<Empty>
					<EmptyMedia variant="icon">
						<Database />
					</EmptyMedia>
					<EmptyTitle>No monitors yet</EmptyTitle>
					<EmptyDescription>Add the first endpoint to start collecting availability checks.</EmptyDescription>
					{!formOpen && (
						<EmptyContent>
							<Button variant="unstyled" className="primary-button" type="button" onClick={onAddMonitor}>
								Add first site <ArrowRight />
							</Button>
						</EmptyContent>
					)}
				</Empty>
			) : (
				<div>
					<div className="hidden min-h-10 items-center gap-x-5 border-b border-border-heading bg-surface-soft px-5 text-micro text-ink-muted-dark min-[1001px]:grid min-[1001px]:grid-cols-[minmax(320px,1.5fr)_minmax(220px,0.9fr)_minmax(200px,0.6fr)] dark:border-white/6 dark:bg-night-subtle dark:text-neutral-400">
						<span>Monitor</span>
						<span>Latest result</span>
						<span>Uptime</span>
					</div>
					{monitors.map((monitor) => {
						const status = monitorState(monitor);
						const uptime = uptimeWindows(servicesById.get(monitor.id));
						return (
							<article
								className={cn(
									'grid min-h-28 grid-cols-1 items-center gap-4.5 px-4 py-4.5 transition-[opacity,background-color] duration-150 not-first:border-t not-first:border-border-row hover:bg-surface-hover sm:px-5 min-[761px]:grid-cols-[minmax(280px,1fr)_minmax(200px,0.7fr)] min-[761px]:gap-x-5 min-[1001px]:grid-cols-[minmax(320px,1.5fr)_minmax(220px,0.9fr)_minmax(200px,0.6fr)] dark:not-first:border-white/6 dark:hover:bg-white/2',
									monitor.enabled ? 'bg-transparent' : 'bg-surface-soft opacity-55 dark:bg-black/20',
								)}
								key={monitor.id}
							>
								<div className="flex min-w-0 items-center gap-3.5">
									<span className="flex size-10 shrink-0 items-center justify-center rounded-md border border-border-card bg-white text-muted-foreground dark:border-white/8 dark:bg-night-icon dark:text-neutral-400">
										<SiteIcon key={monitor.url} monitorId={monitor.id} />
									</span>
									<div className="min-w-0">
										<Button
											variant="unstyled"
											className="block max-w-full cursor-pointer truncate p-0 text-left text-item font-medium text-foreground hover:text-accent-green-hover hover:underline hover:underline-offset-[3px] dark:text-neutral-50 dark:hover:text-brand"
											type="button"
											onClick={() => navigate(`/monitors/${monitor.id}`)}
										>
											{monitor.name}
										</Button>
										<small
											className="mt-1 block truncate font-mono text-micro text-ink-muted-dark dark:text-neutral-400"
											title={monitor.url}
										>
											{monitor.url}
										</small>
										<span className="mt-1.25 block text-micro text-ink-faint-alt dark:text-faint">
											{monitor.method} · expect {monitor.expectedStatus} · every {monitor.intervalSeconds / 60}m
										</span>
									</div>
								</div>
								<div className="grid min-w-0 justify-items-start gap-1.5">
									<Badge variant={status.variant} title={status.detail ?? undefined}>
										{status.label}
									</Badge>
									<code className="font-mono text-micro text-ink-code dark:rounded dark:bg-white/5 dark:px-1.25 dark:py-0.5 dark:text-neutral-300">
										{monitor.lastStatusCode === null ? '—' : `HTTP ${monitor.lastStatusCode}`} ·{' '}
										{monitor.lastLatencyMs === null ? '—' : `${monitor.lastLatencyMs} ms`}
									</code>
									{(status.detail ?? monitor.lastError) ? (
										<small
											className="max-w-full truncate text-micro text-ink-subtle-2 dark:text-neutral-400"
											title={status.detail ?? monitor.lastError ?? undefined}
										>
											{status.detail ?? monitor.lastError}
										</small>
									) : null}
									<small
										className="max-w-full truncate text-micro text-ink-subtle-2 dark:text-neutral-400"
										title={formatCheckedAt(monitor.lastCheckedAt)}
									>
										{formatCheckedAt(monitor.lastCheckedAt)}
									</small>
								</div>
								<dl className="grid grid-cols-3 gap-x-4 gap-y-1" title={monitor.enabled ? undefined : 'Paused — no uptime data'}>
									{(
										[
											['Today', uptime.today],
											['7d', uptime.d7],
											['30d', uptime.d30],
										] as const
									).map(([label, percentage]) => (
										<div key={label} className="min-w-0">
											<dt className="text-micro text-ink-faint-alt dark:text-faint">{label}</dt>
											<dd
												className={cn(
													'font-mono text-item font-medium',
													percentage !== null &&
														(percentage >= 99.9 ? 'text-accent-green-deep' : percentage < 99 ? 'text-danger-subtle' : 'text-foreground'),
												)}
											>
												{percentage === null ? '—' : `${percentage.toFixed(1)}%`}
											</dd>
										</div>
									))}
								</dl>
							</article>
						);
					})}
				</div>
			)}
		</section>
	);
}
