import { useState } from 'react';
import { Bar, BarChart, Cell, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { Empty, EmptyDescription, EmptyTitle } from '@/components/ui/empty';
import type { Check } from '../../api/monitors';

type UptimeDatum = {
	t: string;
	v: number;
	ok: boolean;
	id: number;
	status: 'up' | 'down';
	fill: string;
};

const uptimeConfig = {
	up: { label: 'Up', color: 'var(--primary)' },
	down: { label: 'Down', color: 'var(--chart-down)' },
} satisfies ChartConfig;

export function UptimeBar({ checks }: { checks: Check[] }) {
	const [hasAnimated, setHasAnimated] = useState(false);
	const data: UptimeDatum[] = checks.toReversed().map((check) => ({
		t: check.checkedAt,
		v: 1,
		ok: check.ok,
		id: check.id,
		status: check.ok ? 'up' : 'down',
		fill: check.ok ? 'var(--color-up)' : 'var(--color-down)',
	}));

	if (data.length === 0)
		return (
			<Empty className="min-h-37.5 p-6">
				<EmptyTitle className="text-[13px]">No availability data yet</EmptyTitle>
				<EmptyDescription>No availability checks recorded yet.</EmptyDescription>
			</Empty>
		);

	const successfulChecks = data.filter((check) => check.ok).length;
	return (
		<div>
			<div className="uptime-bar" role="img" aria-label={`${successfulChecks} of ${data.length} recent checks succeeded`}>
				<ChartContainer config={uptimeConfig} className="h-full w-full">
					<BarChart data={data} barCategoryGap={2} margin={{ top: 10, right: 0, bottom: 0, left: 0 }}>
						<XAxis dataKey="id" hide />
						<YAxis hide domain={[0, 1]} />
						<ChartTooltip
							content={
								<ChartTooltipContent
									className="min-w-36 gap-1.5 rounded-[6px] border-(--hairline) bg-white/97 px-3 py-2.5 shadow-[0_8px_24px_rgb(24_74_52/0.1),0_2px_6px_rgb(0_0_0/0.04)] backdrop-blur-sm"
									hideIndicator={false}
									nameKey="status"
									labelFormatter={(_, payload) => new Date((payload[0].payload as UptimeDatum).t).toLocaleString()}
								/>
							}
							isAnimationActive={false}
						/>
						<Bar
							dataKey="v"
							radius={[2, 2, 0, 0]}
							isAnimationActive={!hasAnimated}
							animationDuration={700}
							animationEasing="ease-out"
							onAnimationEnd={() => setHasAnimated(true)}
						>
							{data.map((point) => (
								<Cell key={point.id} fill={point.ok ? 'var(--color-up)' : 'var(--color-down)'} />
							))}
						</Bar>
					</BarChart>
				</ChartContainer>
			</div>
			<div className="uptime-legend">
				<span>Oldest</span>
				<span>
					<i className="legend-up" /> Up <i className="legend-down" /> Down
				</span>
				<span>Latest</span>
			</div>
		</div>
	);
}
