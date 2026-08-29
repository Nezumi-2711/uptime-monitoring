import { useState, type ComponentProps } from 'react';
import { Bar, BarChart, Cell, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { Empty, EmptyDescription, EmptyTitle } from '@/components/ui/empty';
import type { Check } from '../../api/monitors';

type UptimeDatum = {
	startTime: string;
	endTime: string;
	v: number;
	ok: boolean;
	id: string;
	successfulChecks: number;
	totalChecks: number;
	status: 'up' | 'down';
	fill: string;
};

const MAX_VISIBLE_SEGMENTS = 32;

const uptimeConfig = {
	up: { label: 'Up', color: 'var(--primary)' },
	down: { label: 'Down', color: 'var(--chart-down)' },
} satisfies ChartConfig;

function formatBucketTime(point: UptimeDatum) {
	const start = new Date(point.startTime);
	const end = new Date(point.endTime);
	if (point.totalChecks === 1) return end.toLocaleString();

	return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).formatRange(start, end);
}

const formatUptimeTooltip: NonNullable<ComponentProps<typeof ChartTooltipContent>['formatter']> = (_, __, item) => {
	const point = item.payload as UptimeDatum;
	return (
		<div className="flex w-full items-center justify-between gap-5">
			<span className="text-[#777]">Successful</span>
			<span className="font-mono font-medium tabular-nums text-[#171717]">
				{point.successfulChecks}/{point.totalChecks}
			</span>
		</div>
	);
};

function groupChecks(checks: Check[]): UptimeDatum[] {
	const chronologicalChecks = checks.toReversed();
	const bucketCount = Math.min(chronologicalChecks.length, MAX_VISIBLE_SEGMENTS);
	const buckets = Array.from({ length: bucketCount }, () => [] as Check[]);

	chronologicalChecks.forEach((check, index) => {
		const bucketIndex = Math.min(bucketCount - 1, Math.floor((index * bucketCount) / chronologicalChecks.length));
		buckets[bucketIndex].push(check);
	});

	return buckets.map((bucket) => {
		const first = bucket[0];
		const last = bucket[bucket.length - 1];
		const successfulChecks = bucket.filter((check) => check.ok).length;
		const ok = successfulChecks === bucket.length;

		return {
			startTime: first.checkedAt,
			endTime: last.checkedAt,
			v: 1,
			ok,
			id: `${first.id}-${last.id}`,
			successfulChecks,
			totalChecks: bucket.length,
			status: ok ? 'up' : 'down',
			fill: ok ? 'var(--color-up)' : 'var(--color-down)',
		};
	});
}

export function UptimeBar({ checks }: { checks: Check[] }) {
	const [hasAnimated, setHasAnimated] = useState(false);
	const data = groupChecks(checks);

	if (data.length === 0)
		return (
			<Empty className="min-h-37.5 p-6">
				<EmptyTitle className="text-[13px]">No availability data yet</EmptyTitle>
				<EmptyDescription>No availability checks recorded yet.</EmptyDescription>
			</Empty>
		);

	const successfulChecks = checks.filter((check) => check.ok).length;
	return (
		<div>
			<div className="uptime-bar" role="img" aria-label={`${successfulChecks} of ${checks.length} recent checks succeeded`}>
				<ChartContainer config={uptimeConfig} className="h-full w-full">
					<BarChart data={data} barCategoryGap="24%" margin={{ top: 6, right: 0, bottom: 0, left: 0 }}>
						<XAxis dataKey="id" hide />
						<YAxis hide domain={[0, 1]} />
						<ChartTooltip
							content={
								<ChartTooltipContent
									className="min-w-36 gap-1.5 rounded-[6px] border-(--hairline) bg-white/97 px-3 py-2.5 shadow-[0_8px_24px_rgb(24_74_52/0.1),0_2px_6px_rgb(0_0_0/0.04)] backdrop-blur-sm"
									hideIndicator={false}
									nameKey="status"
									labelFormatter={(_, payload) => formatBucketTime(payload[0].payload as UptimeDatum)}
									formatter={formatUptimeTooltip}
								/>
							}
							isAnimationActive={false}
						/>
						<Bar
							dataKey="v"
							radius={[3, 3, 1, 1]}
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
