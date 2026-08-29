import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useMonitorsQuery } from '../../queries/monitors';

type DashboardOverviewProps = {
	onAddMonitor: () => void;
};

export function DashboardOverview({ onAddMonitor }: DashboardOverviewProps) {
	const monitorsQuery = useMonitorsQuery();
	const monitors = monitorsQuery.data?.monitors ?? [];
	const up = monitors.filter((monitor) => monitor.lastOk === true).length;
	const down = monitors.filter((monitor) => monitor.lastOk === false).length;

	return (
		<>
			<section className="dashboard-intro">
				<div>
					<p className="overline">Infrastructure</p>
					<h1>Monitors</h1>
					<p>Track endpoint availability from Cloudflare's edge every five minutes.</p>
				</div>
				{monitorsQuery.isSuccess && monitors.length > 0 ? (
					<Button variant="unstyled" className="primary-button" type="button" onClick={onAddMonitor}>
						Add monitor <ArrowRight />
					</Button>
				) : null}
			</section>

			<section className="metric-grid" aria-label="Monitor summary">
				<div className="metric-card">
					<p>Total monitors</p>
					<strong>{monitors.length}</strong>
					<span>{monitors.filter((monitor) => monitor.enabled).length} enabled</span>
				</div>
				<div className="metric-card">
					<p>Currently up</p>
					<strong>{up}</strong>
					<span>Latest checks succeeded</span>
				</div>
				<div className="metric-card">
					<p>Currently down</p>
					<strong>{down}</strong>
					<span>Needs attention</span>
				</div>
			</section>
		</>
	);
}
