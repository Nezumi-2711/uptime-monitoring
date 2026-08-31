import { Badge } from '@/components/ui/badge';
import { Empty, EmptyDescription, EmptyTitle } from '@/components/ui/empty';
import { useAiEventsQuery } from '../../queries/settings';

function formatTokens(value: number) {
	return new Intl.NumberFormat(undefined, { notation: value >= 10_000 ? 'compact' : 'standard' }).format(value);
}

export function AiActivityPanel() {
	const query = useAiEventsQuery();
	if (query.isPending) return <div className="table-empty">Loading AI activity…</div>;
	if (query.isError) {
		return (
			<Empty variant="error" className="m-6">
				<EmptyTitle>Unable to load AI activity</EmptyTitle>
			</Empty>
		);
	}
	const { events, summary } = query.data;
	const tokenTotal = summary.promptTokens + summary.completionTokens;
	return (
		<div className="ai-activity-panel">
			<div className="ai-activity-stats">
				<div>
					<strong>{summary.total ? Math.round((summary.ok / summary.total) * 100) : 0}%</strong>
					<span>Success rate</span>
				</div>
				<div>
					<strong>{summary.total}</strong>
					<span>Calls · 7 days</span>
				</div>
				<div>
					<strong>{summary.averageLatencyMs === null ? '—' : `${summary.averageLatencyMs} ms`}</strong>
					<span>Average latency</span>
				</div>
				<div>
					<strong>{formatTokens(tokenTotal)}</strong>
					<span>Total tokens</span>
				</div>
			</div>
			{events.length === 0 ? (
				<Empty className="channel-empty">
					<EmptyTitle>No AI activity yet</EmptyTitle>
					<EmptyDescription>Attempts will appear here after AI generation or autopilot runs.</EmptyDescription>
				</Empty>
			) : (
				<div className="ai-activity-history" aria-label="AI activity history">
					{events.map((event) => (
						<div className="ai-activity-row" key={event.id}>
							<Badge variant={event.outcome === 'ok' ? 'online' : event.outcome.startsWith('skipped') ? 'pending' : 'offline'}>
								{event.outcome.replaceAll('_', ' ')}
							</Badge>
							<strong>{event.kind.replaceAll('_', ' ')}</strong>
							<span>{new Date(event.createdAt).toLocaleString()}</span>
							<span>{event.reason ?? event.model ?? '—'}</span>
							<small>
								{event.latencyMs === null ? '—' : `${event.latencyMs} ms`} ·{' '}
								{formatTokens((event.promptTokens ?? 0) + (event.completionTokens ?? 0))} tokens
							</small>
						</div>
					))}
				</div>
			)}
		</div>
	);
}
