import type { PublicIncidentUpdate } from '../api/status';

const timestamp = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export function IncidentTimeline({ updates }: { updates: PublicIncidentUpdate[] }) {
	return (
		<section className="pt-6.75" aria-labelledby="incident-updates-title">
			<header className="flex items-end justify-between gap-4.5">
				<div>
					<p className="overline mb-1 dark:text-brand-soft">Activity</p>
					<h2 id="incident-updates-title" className="m-0 text-lg font-medium leading-entry tracking-tight-sm dark:text-neutral-50">
						Incident updates
					</h2>
				</div>
				<span className="text-footnote text-faint dark:text-faint">
					{updates.length} {updates.length === 1 ? 'update' : 'updates'}
				</span>
			</header>
			{updates.length > 0 ? (
				<ol className="m-0 mt-5.5 grid list-none gap-0 p-0">
					{updates.map((update, index) => (
						<li
							key={`${update.createdAt}-${index}`}
							className="relative grid grid-cols-[var(--spacing-timeline-col)_minmax(0,1fr)] gap-3.25 pb-6.25 not-last:before:absolute not-last:before:bottom-0 not-last:before:left-1.25 not-last:before:top-3 not-last:before:w-px not-last:before:bg-border"
						>
							<span
								className="relative z-1 mt-0.75 size-2.75 rounded-full border-3 border-card bg-primary-deep shadow-timeline-dot"
								aria-hidden="true"
							/>
							<div className="min-w-0">
								<header className="flex items-baseline justify-between gap-4.5 max-sm:flex-col max-sm:items-start max-sm:gap-0.75">
									<strong className="text-caption font-semibold capitalize dark:text-neutral-100">{update.status}</strong>
									<time
										className="font-mono text-2xs leading-overline text-faint whitespace-nowrap dark:text-faint"
										dateTime={update.createdAt}
									>
										{timestamp.format(new Date(update.createdAt))}
									</time>
								</header>
								<p className="m-0 mt-1.75 max-w-dialog-channel text-sm leading-body-relaxed text-ink-detail dark:text-neutral-300">
									{update.body}
								</p>
							</div>
						</li>
					))}
				</ol>
			) : (
				<p className="my-5.5 mb-7 rounded-md border border-dashed border-border-dashed-light bg-surface-elevated p-4.5 text-caption text-muted-foreground dark:border-white/10 dark:bg-night-summary dark:text-neutral-400">
					No updates have been posted for this incident.
				</p>
			)}
		</section>
	);
}
