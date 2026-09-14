import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useMonitorsQuery } from '../../queries/monitors';

type DashboardOverviewProps = {
	onAddMonitor: () => void;
};

export function DashboardOverview({ onAddMonitor }: DashboardOverviewProps) {
	const monitorsQuery = useMonitorsQuery();
	const monitors = monitorsQuery.data?.monitors ?? [];
	const up = monitors.filter((monitor) => monitor.lastOk === true).length;
	const down = monitors.filter((monitor) => monitor.lastOk === false).length;
	const degrading = monitors.filter((monitor) => monitor.lastOk !== false && monitor.consecutiveFailures > 0).length;

	return (
		<>
			<section className="flex flex-col items-start justify-between gap-8 md:flex-row md:items-end">
				<div>
					<p className="overline">Infrastructure</p>
					<h1 className="m-0 text-display-sm font-medium leading-[1.1] tracking-display text-foreground md:text-display dark:text-neutral-50">
						Monitors
					</h1>
					<p className="mt-3 text-subtitle leading-normal text-muted-foreground md:leading-subtitle dark:text-neutral-400">
						Track endpoint availability from Cloudflare's edge every five minutes.
					</p>
				</div>
				{monitorsQuery.isSuccess && monitors.length > 0 ? (
					<Button variant="unstyled" className="primary-button" type="button" onClick={onAddMonitor}>
						Add monitor <ArrowRight />
					</Button>
				) : null}
			</section>

			<section className="mt-7 grid grid-cols-1 gap-2.5 md:mt-10 md:grid-cols-3 md:gap-4" aria-label="Monitor summary">
				<Card className="min-h-auto p-5 md:min-h-metric-h md:p-6 dark:border-white/8 dark:shadow-[0_8px_24px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.04)]">
					<p className="m-0 mb-3 text-caption text-muted-foreground md:mb-5 dark:text-neutral-400">Total monitors</p>
					<strong className="block text-metric font-medium leading-none tracking-metric text-foreground dark:text-neutral-50">
						{monitors.length}
					</strong>
					<span className="mt-2.5 block text-caption text-faint">{monitors.filter((monitor) => monitor.enabled).length} enabled</span>
				</Card>
				<Card className="min-h-auto p-5 md:min-h-metric-h md:p-6 dark:border-white/8 dark:shadow-[0_8px_24px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.04)]">
					<p className="m-0 mb-3 text-caption text-muted-foreground md:mb-5 dark:text-neutral-400">Currently up</p>
					<strong className="block text-metric font-medium leading-none tracking-metric text-foreground dark:text-neutral-50">{up}</strong>
					<span className="mt-2.5 block text-caption text-faint">Latest checks succeeded</span>
				</Card>
				<Card className="min-h-auto p-5 md:min-h-metric-h md:p-6 dark:border-white/8 dark:shadow-[0_8px_24px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.04)]">
					<p className="m-0 mb-3 text-caption text-muted-foreground md:mb-5 dark:text-neutral-400">Currently down</p>
					<strong className="block text-metric font-medium leading-none tracking-metric text-foreground dark:text-neutral-50">
						{down}
					</strong>
					<span className="mt-2.5 block text-caption text-faint">{degrading > 0 ? `${degrading} degrading` : 'Needs attention'}</span>
				</Card>
			</section>
		</>
	);
}
