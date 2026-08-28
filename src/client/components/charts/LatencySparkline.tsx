import { useEffect, useRef } from "react";
import {
	Area,
	AreaChart,
	CartesianGrid,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
	type TooltipContentProps,
} from "recharts";
import type { Check } from "../../api/monitors";

type LatencyDatum = {
	t: string;
	latency: number;
	ok: boolean;
};

function LatencyTooltip({ active, payload }: TooltipContentProps<number, string>) {
	if (!active || !payload.length) return null;

	const point = payload[0].payload as LatencyDatum;
	return (
		<div className="chart-tooltip">
			<time>{new Date(point.t).toLocaleString()}</time>
			<strong>{point.latency} ms</strong>
			<span className={point.ok ? "is-up" : "is-down"}>{point.ok ? "Up" : "Down"}</span>
		</div>
	);
}

export function LatencySparkline({ checks }: { checks: Check[] }) {
	const hasAnimated = useRef(false);
	const data: LatencyDatum[] = checks.toReversed().map((check) => ({
		t: check.checkedAt,
		latency: check.latencyMs,
		ok: check.ok,
	}));
	const values = data.map((point) => point.latency);

	useEffect(() => {
		if (data.length >= 2) hasAnimated.current = true;
	}, [data.length]);

	if (data.length < 2) return <div className="chart-empty">More checks are needed to draw latency.</div>;

	const minimum = Math.min(...values);
	const maximum = Math.max(...values);

	return (
		<div
			className="sparkline-wrap"
			role="img"
			aria-label={`Latency from ${minimum} to ${maximum} milliseconds`}
		>
			<ResponsiveContainer width="100%" height="100%">
				<AreaChart data={data} margin={{ top: 10, right: 4, bottom: 4, left: 4 }}>
					<defs>
						<linearGradient id="latency-fill" x1="0" y1="0" x2="0" y2="1">
							<stop offset="0" stopColor="#3ecf8e" stopOpacity="0.22" />
							<stop offset="1" stopColor="#3ecf8e" stopOpacity="0" />
						</linearGradient>
					</defs>
					<CartesianGrid vertical={false} stroke="#eeeeee" strokeDasharray="3 5" />
					<XAxis dataKey="t" hide />
					<YAxis hide domain={["dataMin", "dataMax"]} />
					<Tooltip
						content={LatencyTooltip}
						cursor={{ stroke: "#9adfc1", strokeDasharray: "3 4" }}
						isAnimationActive={false}
					/>
					<Area
						type="monotone"
						dataKey="latency"
						stroke="#24b47e"
						strokeWidth={2.5}
						fill="url(#latency-fill)"
						activeDot={{ r: 4, fill: "#24b47e", stroke: "#fff", strokeWidth: 2 }}
						isAnimationActive={!hasAnimated.current}
						animationDuration={700}
						animationEasing="ease-out"
					/>
				</AreaChart>
			</ResponsiveContainer>
			<div className="chart-scale"><span>{maximum} ms</span><span>{minimum} ms</span></div>
		</div>
	);
}
