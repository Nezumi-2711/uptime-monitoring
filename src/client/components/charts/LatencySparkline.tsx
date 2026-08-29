import { useState } from 'react';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { Empty, EmptyDescription, EmptyTitle } from '@/components/ui/empty';
import type { Check } from '../../api/monitors';

type LatencyDatum = {
	t: string;
	latency: number;
	ok: boolean;
};

const latencyConfig = {
	latency: { label: 'Latency', color: 'var(--primary-deep)' },
} satisfies ChartConfig;

export function LatencySparkline({ checks }: { checks: Check[] }) {
	const [hasAnimated, setHasAnimated] = useState(false);
	const data: LatencyDatum[] = checks.toReversed().map((check) => ({
		t: check.checkedAt,
		latency: check.latencyMs,
		ok: check.ok,
	}));
	const values = data.map((point) => point.latency);

	if (data.length < 2)
		return (
			<Empty className="min-h-37.5 p-6">
				<EmptyTitle className="text-[13px]">Not enough latency data</EmptyTitle>
				<EmptyDescription>More checks are needed to draw latency.</EmptyDescription>
			</Empty>
		);

	const minimum = Math.min(...values);
	const maximum = Math.max(...values);

	return (
		<div className="sparkline-wrap" role="img" aria-label={`Latency from ${minimum} to ${maximum} milliseconds`}>
			<ChartContainer config={latencyConfig} className="h-full w-full">
				<AreaChart data={data} margin={{ top: 10, right: 4, bottom: 4, left: 4 }}>
					<defs>
						<linearGradient id="latency-fill" x1="0" y1="0" x2="0" y2="1">
							<stop offset="0" stopColor="var(--color-latency)" stopOpacity="0.22" />
							<stop offset="1" stopColor="var(--color-latency)" stopOpacity="0" />
						</linearGradient>
					</defs>
					<CartesianGrid vertical={false} strokeDasharray="3 5" />
					<XAxis dataKey="t" hide />
					<YAxis hide domain={['dataMin', 'dataMax']} />
					<ChartTooltip
						content={
							<ChartTooltipContent
								className="min-w-36 gap-1.5 rounded-[6px] border-(--hairline) bg-white/97 px-3 py-2.5 shadow-[0_8px_24px_rgb(24_74_52/0.1),0_2px_6px_rgb(0_0_0/0.04)] backdrop-blur-sm"
								labelFormatter={(_, payload) => new Date((payload[0].payload as LatencyDatum).t).toLocaleString()}
							/>
						}
						cursor={{ stroke: 'var(--primary)', strokeDasharray: '3 4' }}
						isAnimationActive={false}
					/>
					<Area
						type="monotone"
						dataKey="latency"
						stroke="var(--color-latency)"
						strokeWidth={2.5}
						fill="url(#latency-fill)"
						activeDot={{ r: 4, fill: 'var(--color-latency)', stroke: 'var(--background)', strokeWidth: 2 }}
						isAnimationActive={!hasAnimated}
						animationDuration={700}
						animationEasing="ease-out"
						onAnimationEnd={() => setHasAnimated(true)}
					/>
				</AreaChart>
			</ChartContainer>
			<div className="chart-scale">
				<span>{maximum} ms</span>
				<span>{minimum} ms</span>
			</div>
		</div>
	);
}
