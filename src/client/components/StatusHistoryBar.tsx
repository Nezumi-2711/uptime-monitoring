import type { PublicService } from '../api/status';
import { useMediaQuery } from '../lib/useMediaQuery';

const DAY_MS = 24 * 60 * 60 * 1000;
// Desktop mirrors the API's full 90-day history. Compact screens use the most
// recent 45 days so each daily bar remains legible.
const HISTORY_DAYS = 90;
const HISTORY_DAYS_COMPACT = 45;
const COMPACT_QUERY = '(max-width: 520px)';

type HistoryEntry = PublicService['history'][number];

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

export function StatusHistoryBar({ history }: { history: HistoryEntry[] }) {
	const compact = useMediaQuery(COMPACT_QUERY);
	const windowDays = compact ? HISTORY_DAYS_COMPACT : HISTORY_DAYS;
	const historyByDay = new Map(history.map((entry) => [entry.day, entry.uptimePct]));
	const now = new Date();
	const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
	const days = Array.from({ length: windowDays }, (_day, index) => {
		const day = today - (windowDays - 1 - index) * DAY_MS;
		return { day, uptimePct: historyByDay.get(day) };
	});

	return (
		<div className="status-history">
			<div className="uptime-days" aria-label={`Daily uptime over the last ${windowDays} days`}>
				{days.map(({ day, uptimePct }) => (
					<span className={`uptime-day ${dayClass(uptimePct)}`} key={day} title={dayTitle(day, uptimePct)} />
				))}
			</div>
			<div className="uptime-days-caption" aria-hidden="true">
				<span>{windowDays} days ago</span>
				<i />
				<span>Today</span>
			</div>
		</div>
	);
}
