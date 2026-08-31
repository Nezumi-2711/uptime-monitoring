import type { PublicService } from '../api/status';
import { useMediaQuery } from '../lib/useMediaQuery';

const DAY_MS = 24 * 60 * 60 * 1000;
const HISTORY_DAYS = 90;
const MOBILE_DAYS_PER_BAR = 3;
const MOBILE_QUERY = '(max-width: 520px)';

type HistoryEntry = PublicService['history'][number];
type HistoryDay = { day: number; uptimePct: number | null | undefined };

function dayClass(uptimePct: number | null | undefined) {
	if (uptimePct === null || uptimePct === undefined) return 'is-empty';
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

function dayTitle(day: number, uptimePct: number | null | undefined) {
	const detail = uptimePct === null || uptimePct === undefined ? 'No data' : `${uptimePct.toFixed(1)}% uptime`;
	return `${formatDay(day)}: ${detail}`;
}

function summarizeDays(days: HistoryDay[]) {
	return Array.from({ length: days.length / MOBILE_DAYS_PER_BAR }, (_period, index) => {
		const periodDays = days.slice(index * MOBILE_DAYS_PER_BAR, (index + 1) * MOBILE_DAYS_PER_BAR);
		const uptimeValues = periodDays.flatMap(({ uptimePct }) => (uptimePct === null || uptimePct === undefined ? [] : [uptimePct]));
		const uptimePct = uptimeValues.length ? uptimeValues.reduce((total, value) => total + value, 0) / uptimeValues.length : undefined;

		return {
			startDay: periodDays[0].day,
			endDay: periodDays[periodDays.length - 1].day,
			uptimePct,
		};
	});
}

export function StatusHistoryBar({ history }: { history: HistoryEntry[] }) {
	const mobile = useMediaQuery(MOBILE_QUERY);
	const historyByDay = new Map(history.map((entry) => [entry.day, entry.uptimePct]));
	const now = new Date();
	const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
	const days = Array.from({ length: HISTORY_DAYS }, (_day, index) => {
		const day = today - (HISTORY_DAYS - 1 - index) * DAY_MS;
		return { day, uptimePct: historyByDay.get(day) };
	});
	const periods = mobile ? summarizeDays(days) : days.map(({ day, uptimePct }) => ({ startDay: day, endDay: day, uptimePct }));

	return (
		<div className="status-history">
			<div
				className="uptime-days"
				aria-label={
					mobile
						? `Uptime over the last ${HISTORY_DAYS} days, summarized in ${MOBILE_DAYS_PER_BAR}-day periods`
						: `Daily uptime over the last ${HISTORY_DAYS} days`
				}
			>
				{periods.map(({ startDay, endDay, uptimePct }) => (
					<span
						className={`uptime-day ${dayClass(uptimePct)}`}
						key={startDay}
						title={
							startDay === endDay
								? dayTitle(startDay, uptimePct)
								: `${formatDay(startDay)} – ${formatDay(endDay)}: ${
										uptimePct === undefined ? 'No data' : `${uptimePct.toFixed(1)}% average uptime`
									}`
						}
					/>
				))}
			</div>
			<div className="uptime-days-caption" aria-hidden="true">
				<span>{HISTORY_DAYS} days ago</span>
				<i />
				<span>Today</span>
			</div>
		</div>
	);
}
