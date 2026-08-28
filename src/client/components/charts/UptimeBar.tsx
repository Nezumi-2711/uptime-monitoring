import type { Check } from "../../api/monitors";

export function UptimeBar({ checks }: { checks: Check[] }) {
	if (checks.length === 0) return <div className="chart-empty">No availability checks recorded yet.</div>;
	const ordered = checks.toReversed();
	return (
		<div>
			<div className="uptime-bar" role="img" aria-label={`${ordered.filter((check) => check.ok).length} of ${ordered.length} recent checks succeeded`}>
				{ordered.map((check) => (
					<span
						className={check.ok ? "is-up" : "is-down"}
						key={check.id}
						title={`${new Date(check.checkedAt).toLocaleString()} — ${check.ok ? "Up" : "Down"}`}
					/>
				))}
			</div>
			<div className="uptime-legend"><span>Oldest</span><span><i className="legend-up" /> Up <i className="legend-down" /> Down</span><span>Latest</span></div>
		</div>
	);
}
