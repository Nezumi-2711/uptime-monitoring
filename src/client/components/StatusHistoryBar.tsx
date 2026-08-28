import type { PublicService } from "../api/status";

const DAY_MS = 24 * 60 * 60 * 1000;
const HISTORY_DAYS = 90;

type HistoryEntry = PublicService["history"][number];

function dayClass(uptimePct: number | null) {
	if (uptimePct === null) return "is-empty";
	if (uptimePct === 100) return "is-up";
	if (uptimePct === 0) return "is-down";
	return "is-partial";
}

function dayTitle(day: number, uptimePct: number | null) {
	const date = new Intl.DateTimeFormat("en", {
		month: "short",
		day: "numeric",
		year: "numeric",
		timeZone: "UTC",
	}).format(new Date(day));
	return `${date}: ${uptimePct === null ? "No data" : `${uptimePct.toFixed(1)}% uptime`}`;
}

export function StatusHistoryBar({ history }: { history: HistoryEntry[] }) {
	const historyByDay = new Map(history.map((entry) => [entry.day, entry.uptimePct]));
	const now = new Date();
	const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
	const days = Array.from({ length: HISTORY_DAYS }, (_, index) => {
		const day = today - (HISTORY_DAYS - index - 1) * DAY_MS;
		return { day, uptimePct: historyByDay.get(day) ?? null };
	});

	return (
		<div className="status-history">
		<div className="uptime-days" aria-label="Daily uptime over the last 90 days">
			{days.map(({ day, uptimePct }) => (
				<span
					className={`uptime-day ${dayClass(uptimePct)}`}
					key={day}
					title={dayTitle(day, uptimePct)}
				/>
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
