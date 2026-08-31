import type { PublicIncidentUpdate } from '../api/status';

const timestamp = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export function IncidentTimeline({ updates }: { updates: PublicIncidentUpdate[] }) {
	return (
		<section className="incident-timeline-section" aria-labelledby="incident-updates-title">
			<header className="incident-timeline-heading">
				<div>
					<p className="overline">Activity</p>
					<h2 id="incident-updates-title">Incident updates</h2>
				</div>
				<span>
					{updates.length} {updates.length === 1 ? 'update' : 'updates'}
				</span>
			</header>
			{updates.length > 0 ? (
				<ol className="incident-timeline">
					{updates.map((update, index) => (
						<li key={`${update.createdAt}-${index}`}>
							<span className="incident-timeline-dot" aria-hidden="true" />
							<div className="incident-timeline-entry">
								<header>
									<strong>{update.status}</strong>
									<time dateTime={update.createdAt}>{timestamp.format(new Date(update.createdAt))}</time>
								</header>
								<p>{update.body}</p>
							</div>
						</li>
					))}
				</ol>
			) : (
				<p className="incident-timeline-empty">No updates have been posted for this incident.</p>
			)}
		</section>
	);
}
