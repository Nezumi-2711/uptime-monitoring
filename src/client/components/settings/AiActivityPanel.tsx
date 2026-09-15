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
		<div className="pt-5.5 px-panel-x pb-panel-x">
			<div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 [&>div]:grid [&>div]:gap-0.75 [&>div]:p-3.5 [&>div]:rounded-card-sm [&>div]:border [&>div]:border-border-panel [&>div]:bg-surface-soft dark:[&>div]:border-white/8 dark:[&>div]:bg-night-subtle dark:[&>div]:shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] [&_strong]:text-subtitle dark:[&_strong]:text-gray-50 [&_span]:text-footnote [&_span]:text-muted-text dark:[&_span]:text-gray-400">
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
				<Empty className="py-11 px-6">
					<EmptyTitle>No AI activity yet</EmptyTitle>
					<EmptyDescription>Attempts will appear here after AI generation or autopilot runs.</EmptyDescription>
				</Empty>
			) : (
				<div
					className="grid content-start gap-px max-h-activity-max mt-4.5 rounded-md border border-border-panel bg-border-panel overflow-auto overscroll-contain table-scrollbar dark:border-white/8 dark:bg-white/6"
					aria-label="AI activity history"
				>
					{events.map((event) => (
						<div
							className="grid grid-cols-2 md:grid-cols-[100px_minmax(110px,0.8fr)_minmax(145px,1fr)_minmax(130px,1fr)_auto] items-center gap-3 p-2.5 sm:px-3 text-footnote bg-white dark:bg-night-panel dark:hover:bg-night-subtle [&>strong]:font-semibold [&>strong]:capitalize dark:[&>strong]:text-gray-50 [&>span]:text-footnote [&>span]:text-muted-text dark:[&>span]:text-gray-400 [&>small]:text-footnote [&>small]:text-muted-text dark:[&>small]:text-gray-400"
							key={event.id}
						>
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
