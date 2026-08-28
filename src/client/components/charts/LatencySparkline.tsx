import type { Check } from "../../api/monitors";

export function LatencySparkline({ checks }: { checks: Check[] }) {
	const values = checks.toReversed().map((check) => check.latencyMs);
	if (values.length < 2) return <div className="chart-empty">More checks are needed to draw latency.</div>;
	const width = 720;
	const height = 180;
	const padding = 12;
	const minimum = Math.min(...values);
	const maximum = Math.max(...values);
	const range = Math.max(maximum - minimum, 1);
	const points = values.map((value, index) => {
		const x = padding + (index / (values.length - 1)) * (width - padding * 2);
		const y = height - padding - ((value - minimum) / range) * (height - padding * 2);
		return `${x.toFixed(1)},${y.toFixed(1)}`;
	}).join(" ");

	return (
		<div className="sparkline-wrap">
			<svg className="latency-sparkline" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Latency from ${minimum} to ${maximum} milliseconds`}>
				<defs>
					<linearGradient id="latency-fill" x1="0" y1="0" x2="0" y2="1">
						<stop offset="0" stopColor="#3ecf8e" stopOpacity="0.22" />
						<stop offset="1" stopColor="#3ecf8e" stopOpacity="0" />
					</linearGradient>
				</defs>
				<path className="chart-grid-line" d={`M 0 ${height * 0.25} H ${width} M 0 ${height * 0.5} H ${width} M 0 ${height * 0.75} H ${width}`} />
				<polygon points={`${padding},${height - padding} ${points} ${width - padding},${height - padding}`} fill="url(#latency-fill)" />
				<polyline points={points} fill="none" stroke="#24b47e" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
			</svg>
			<div className="chart-scale"><span>{maximum} ms</span><span>{minimum} ms</span></div>
		</div>
	);
}
