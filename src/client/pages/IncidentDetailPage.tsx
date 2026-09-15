import { ArrowLeft, TriangleAlert, Zap } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { IncidentTimeline } from '../components/IncidentTimeline';
import { ThemeToggle } from '../components/ThemeToggle';
import { navigate } from '../lib/router';
import { useSeo } from '../lib/seo';
import { usePublicIncidentQuery } from '../queries/status';

const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: 'long', timeStyle: 'short' });

export function IncidentDetailPage({ id }: { id: number }) {
	const query = usePublicIncidentQuery(id);
	const incident = query.data?.incident;
	const latestUpdate = incident?.updates?.at(-1)?.body;
	const fallbackDescription = incident
		? `${incident.services.map((service) => service.name).join(', ') || 'General service incident'} · Started ${dateTime.format(new Date(incident.startedAt))}`
		: 'Public incident report and service restoration updates.';
	useSeo({
		title: incident
			? `${incident.title} — ${incident.status} — upwatch status`
			: query.isError
				? 'Incident not found — upwatch'
				: 'Incident report — upwatch',
		description: latestUpdate ?? fallbackDescription,
		noindex: query.isError,
		canonicalPath: `/incidents/${id}`,
	});
	return (
		<div className="status-page-shell">
			<header className="relative z-20 border-b border-border-row bg-white/94 backdrop-blur-header dark:border-white/8 dark:bg-night-root/85 dark:backdrop-blur-md">
				<div className="mx-auto flex h-17 w-[min(var(--spacing-status-max),calc(100%-48px))] max-tablet:w-[min(var(--spacing-status-max),calc(100%-32px))] max-mobile:h-15.5 items-center justify-between">
					<a className="brand" href="/" aria-label="Upwatch public status">
						<Zap className="brand-mark" fill="currentColor" /> <span>upwatch</span>
					</a>
					<div className="flex items-center gap-2 [&_.app-nav-icon]:dark:text-neutral-400 [&_.app-nav-icon:hover:not(:disabled)]:dark:text-brand [&_.app-nav-icon:hover:not(:disabled)]:dark:bg-brand/12">
						<ThemeToggle className="app-nav-icon" />
						<Button
							variant="unstyled"
							className="min-h-8.5 max-mobile:min-h-9 px-3.25 max-mobile:px-3.5 py-1.5 rounded-md border border-border-action bg-white/86 text-xs font-medium text-ink-body cursor-pointer transition-[border-color,color,transform] duration-160 ease-out hover:-translate-y-px hover:border-border-accent-hover hover:text-accent-green-hover dark:border-white/12 dark:bg-white/4 dark:text-neutral-300 dark:hover:border-brand/35 dark:hover:bg-brand/8 dark:hover:text-brand"
							onClick={() => navigate('/')}
						>
							Status page
						</Button>
					</div>
				</div>
			</header>
			<main className="mx-auto w-[min(var(--spacing-status-max),calc(100%-48px))] max-tablet:w-[min(var(--spacing-status-max),calc(100%-32px))] pt-8.5 max-sm:pt-panel-x pb-14 max-tablet:pb-11">
				<button
					className="inline-flex cursor-pointer items-center gap-1.75 border-0 bg-transparent p-0 text-caption text-muted-foreground hover:text-ink [&>svg]:size-3.75 dark:text-neutral-400 dark:hover:text-neutral-50"
					type="button"
					onClick={() => navigate('/')}
				>
					<ArrowLeft aria-hidden="true" /> All service status
				</button>
				{query.isPending ? (
					<p className="mt-10.5 text-caption text-muted-foreground dark:text-neutral-400" aria-busy="true">
						Loading incident…
					</p>
				) : query.isError || !query.data ? (
					<section className="mt-panel-x max-sm:mt-5.5 grid place-items-center rounded-card border border-border-card bg-card p-8 py-16 text-center shadow-incident-detail [&>svg]:size-6 [&>svg]:text-danger-detail [&>h1]:mt-3.5 [&>h1]:text-xl [&>h1]:font-medium [&>p]:mt-1.75 [&>p]:text-caption [&>p]:text-muted-foreground dark:border-red-400/30 dark:bg-night-danger dark:shadow-incident-detail-dark dark:[&>h1]:text-red-100 dark:[&>p]:text-neutral-300">
						<TriangleAlert aria-hidden="true" />
						<h1>Incident not found</h1>
						<p>{query.error?.message ?? 'The requested incident could not be loaded.'}</p>
					</section>
				) : (
					<article className="mt-panel-x max-sm:mt-5.5 overflow-hidden rounded-card border border-border-card bg-card p-8 pb-2 max-sm:p-5 max-sm:pb-1.25 shadow-incident-detail dark:border-white/8 dark:bg-night-panel dark:shadow-incident-detail-dark">
						<header className="flex items-center justify-between gap-4.5 max-sm:flex-col max-sm:items-start max-sm:gap-3.25 *:data-[slot=badge]:shrink-0 *:data-[slot=badge]:capitalize">
							<div className="min-w-0">
								<p className="overline mb-1.75 text-brand-deep dark:text-brand-soft">Incident report</p>
								<h1 className="m-0 text-incident-title max-sm:text-2xl font-medium leading-tight-md tracking-incident-title dark:text-neutral-50">
									{query.data.incident.title}
								</h1>
							</div>
							<Badge variant={query.data.incident.status === 'resolved' ? 'online' : 'offline'}>{query.data.incident.status}</Badge>
						</header>
						<dl className="mt-7 grid grid-cols-[minmax(190px,1.15fr)_minmax(100px,0.6fr)_minmax(190px,1fr)] max-sm:grid-cols-1 -mx-8 max-sm:-mx-5 px-8 max-sm:px-5 max-sm:py-1 border-y border-border-summary bg-surface-elevated dark:border-white/7 dark:bg-night-summary">
							<div className="min-w-0 py-4.25 max-sm:py-3.25 pr-5 max-sm:pr-0 not-first:pl-5 max-sm:not-first:pl-0 not-first:border-l not-first:border-border-summary max-sm:not-first:border-l-0 max-sm:not-first:border-t max-sm:not-first:border-border-row dark:not-first:border-white/7">
								<dt className="mb-1.5 font-mono text-2xs leading-entry font-medium uppercase tracking-mono-label text-faint dark:text-faint">
									Started
								</dt>
								<dd className="m-0 text-caption font-medium leading-alert text-ink-label-muted dark:text-neutral-200">
									<time dateTime={query.data.incident.startedAt}>{dateTime.format(new Date(query.data.incident.startedAt))}</time>
								</dd>
							</div>
							<div className="min-w-0 py-4.25 max-sm:py-3.25 pr-5 max-sm:pr-0 not-first:pl-5 max-sm:not-first:pl-0 not-first:border-l not-first:border-border-summary max-sm:not-first:border-l-0 max-sm:not-first:border-t max-sm:not-first:border-border-row dark:not-first:border-white/7">
								<dt className="mb-1.5 font-mono text-2xs leading-entry font-medium uppercase tracking-mono-label text-faint dark:text-faint">
									Impact
								</dt>
								<dd className="m-0 text-caption font-medium leading-alert text-ink-label-muted capitalize dark:text-neutral-200">
									{query.data.incident.impact}
								</dd>
							</div>
							<div className="min-w-0 py-4.25 max-sm:py-3.25 pr-5 max-sm:pr-0 not-first:pl-5 max-sm:not-first:pl-0 not-first:border-l not-first:border-border-summary max-sm:not-first:border-l-0 max-sm:not-first:border-t max-sm:not-first:border-border-row dark:not-first:border-white/7">
								<dt className="mb-1.5 font-mono text-2xs leading-entry font-medium uppercase tracking-mono-label text-faint dark:text-faint">
									Affected services
								</dt>
								<dd className="m-0 text-caption font-medium leading-alert text-ink-label-muted dark:text-neutral-200">
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
