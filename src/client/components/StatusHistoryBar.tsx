import type { PublicService } from '../api/status';

const DAY_MS = 24 * 60 * 60 * 1000;
const HISTORY_DAYS = 90;
const DAYS_PER_SEGMENT = 2;
const HISTORY_SEGMENTS = HISTORY_DAYS / DAYS_PER_SEGMENT;

type HistoryEntry = PublicService['history'][number];

function dayClass(uptimePct: number | null) {
	if (uptimePct === null) return 'is-empty';
	if (uptimePct === 100) return 'is-up';
	if (uptimePct === 0) return 'is-down';
	return 'is-partial';
}

function formatDay(day: number) {
	return new Intl.DateTimeFormat('en', {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
		timeZone: 'UTC',
	}).format(new Date(day));
}

function segmentTitle(startDay: number, endDay: number, uptimePct: number | null) {
	const dateRange = `${formatDay(startDay)} – ${formatDay(endDay)}`;
	return `${dateRange}: ${uptimePct === null ? 'No data' : `${uptimePct.toFixed(1)}% uptime`}`;
}

export function StatusHistoryBar({ history }: { history: HistoryEntry[] }) {
	const historyByDay = new Map(history.map((entry) => [entry.day, entry.uptimePct]));
	const now = new Date();
	const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
	const segments = Array.from({ length: HISTORY_SEGMENTS }, (_segment, index) => {
		const startDay = today - (HISTORY_DAYS - index * DAYS_PER_SEGMENT - 1) * DAY_MS;
		const endDay = startDay + (DAYS_PER_SEGMENT - 1) * DAY_MS;
		const values = Array.from({ length: DAYS_PER_SEGMENT }, (_day, dayIndex) => historyByDay.get(startDay + dayIndex * DAY_MS)).filter(
			(value): value is number => value !== undefined && value !== null,
		);
		const uptimePct = values.length === 0 ? null : Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
		return { startDay, endDay, uptimePct };
	});

	return (
		<div className="status-history">
			<div className="uptime-days" aria-label="90-day uptime shown in 45 two-day segments">
				{segments.map(({ startDay, endDay, uptimePct }) => (
					<span className={`uptime-day ${dayClass(uptimePct)}`} key={startDay} title={segmentTitle(startDay, endDay, uptimePct)} />
				))}
			</div>
			<div className="uptime-days-caption" aria-hidden="true">
				<span>90 days ago</span>
				<i />
				<span>Today</span>
			</div>
		</div>
	);
}
