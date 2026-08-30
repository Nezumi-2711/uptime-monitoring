import type { PublicIncidentUpdate } from '../api/status';

const timestamp = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export function IncidentTimeline({ updates }: { updates: PublicIncidentUpdate[] }) {
	return (
		<ol className="incident-timeline">
			{updates.map((update, index) => (
				<li key={`${update.createdAt}-${index}`}>
					<span className="incident-timeline-dot" aria-hidden="true" />
					<div>
						<header>
							<strong>{update.status}</strong>
							<time dateTime={update.createdAt}>{timestamp.format(new Date(update.createdAt))}</time>
						</header>
						<p>{update.body}</p>
					</div>
				</li>
			))}
		</ol>
	);
}
