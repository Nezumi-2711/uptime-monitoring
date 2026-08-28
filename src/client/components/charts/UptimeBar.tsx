import { useEffect, useRef } from "react";
import {
	Bar,
	BarChart,
	Cell,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
	type TooltipContentProps,
} from "recharts";
import type { Check } from "../../api/monitors";

type UptimeDatum = {
	t: string;
	v: number;
	ok: boolean;
	id: number;
};

function UptimeTooltip({ active, payload }: TooltipContentProps) {
	if (!active || !payload.length) return null;

	const point = payload[0].payload as UptimeDatum;
	return (
		<div className="chart-tooltip chart-tooltip-compact">
			<time>{new Date(point.t).toLocaleString()}</time>
			<span className={point.ok ? "is-up" : "is-down"}>{point.ok ? "Up" : "Down"}</span>
		</div>
	);
}

export function UptimeBar({ checks }: { checks: Check[] }) {
	const hasAnimated = useRef(false);
	const data: UptimeDatum[] = checks.toReversed().map((check) => ({
		t: check.checkedAt,
		v: 1,
		ok: check.ok,
		id: check.id,
	}));

	useEffect(() => {
		if (data.length > 0) hasAnimated.current = true;
	}, [data.length]);

	if (data.length === 0) return <div className="chart-empty">No availability checks recorded yet.</div>;

	const successfulChecks = data.filter((check) => check.ok).length;
	return (
		<div>
			<div
				className="uptime-bar"
				role="img"
				aria-label={`${successfulChecks} of ${data.length} recent checks succeeded`}
			>
				<ResponsiveContainer width="100%" height="100%">
					<BarChart data={data} barCategoryGap={2} margin={{ top: 10, right: 0, bottom: 0, left: 0 }}>
						<XAxis dataKey="id" hide />
						<YAxis hide domain={[0, 1]} />
						<Tooltip
							content={UptimeTooltip}
							cursor={{ fill: "rgb(23 23 23 / 0.04)" }}
							isAnimationActive={false}
						/>
						<Bar
							dataKey="v"
							radius={[2, 2, 0, 0]}
							isAnimationActive={!hasAnimated.current}
							animationDuration={700}
							animationEasing="ease-out"
						>
							{data.map((point) => (
								<Cell key={point.id} fill={point.ok ? "#3ecf8e" : "#d95c5c"} />
							))}
						</Bar>
					</BarChart>
				</ResponsiveContainer>
			</div>
			<div className="uptime-legend"><span>Oldest</span><span><i className="legend-up" /> Up <i className="legend-down" /> Down</span><span>Latest</span></div>
		</div>
	);
}
