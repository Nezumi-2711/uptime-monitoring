import { and, desc, eq, gte, sql } from 'drizzle-orm';
import type { CheckResult, Monitor } from '../checks/run-check';
import type { Database } from '../db/client';
import { checks, incidentMonitors, incidents } from '../db/schema';
import { classifyFailure, humanizeDuration, humanizeInterval } from '../lib/humanize';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const RECENT_WINDOW_MS = 24 * HOUR_MS;
const RECENT_LIMIT = 30;
const FLAP_WINDOW = 10;

/**
 * A one-line, plain description of what actually failed. This is internal context
 * for the model only - it may name HTTP codes and transport errors here because
 * the prompt is responsible for translating them into visitor-facing language.
 */
function median(values: number[]): number {
	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

function currentResponseLine(result: CheckResult): string {
	return result.statusCode === null
		? `Current probe: no response after ${result.latencyMs} ms`
		: `Current probe: HTTP ${result.statusCode} after ${result.latencyMs} ms`;
}

/** Representative context used by the "Test generation" button in settings. */
export const SAMPLE_INCIDENT_CONTEXT = [
	'Service name: Upwatch test',
	'What is checked: GET request, healthy when it returns HTTP 200',
	'Check frequency: every 5 min',
	'Detected problem: Server error - the endpoint answered with HTTP 503',
	'Current probe: HTTP 503 after 250 ms',
	'Failed checks in a row: 3 (down for about 15 min)',
	'Recent pattern: 3 of the last 10 checks failed',
	'Typical response time when healthy: about 180 ms',
	'Last healthy check: about 15 min ago',
	'Availability: 96% over the last 24 h (48 checks)',
	'Recurrence: 2 other incidents for this service in the last 30 days',
].join('\n');

/**
 * Builds a compact, plain-text briefing about an incident for the language model.
 * Never includes the monitor URL, hostname, or any IP - only the service name the
 * operator chose and derived signal about behaviour over time.
 */
export async function buildIncidentContext(db: Database, monitor: Monitor, result: CheckResult): Promise<string> {
	const now = Date.now();
	const lines: string[] = [
		`Service name: ${monitor.name}`,
		`What is checked: ${monitor.method} request, healthy when it returns HTTP ${monitor.expectedStatus}`,
		`Check frequency: every ${humanizeInterval(monitor.intervalSeconds)}`,
		`Detected problem: ${classifyFailure(monitor, result)}`,
		currentResponseLine(result),
	];

	try {
		const recent = await db
			.select({ ok: checks.ok, latencyMs: checks.latencyMs, checkedAt: checks.checkedAt })
			.from(checks)
			.where(and(eq(checks.monitorId, monitor.id), eq(checks.maintenance, false), gte(checks.checkedAt, new Date(now - RECENT_WINDOW_MS))))
			.orderBy(desc(checks.checkedAt))
			.limit(RECENT_LIMIT);

		if (recent.length > 0) {
			let consecutive = 0;
			for (const row of recent) {
				if (row.ok) break;
				consecutive += 1;
			}

			if (consecutive > 0) {
				const outageStart = recent[consecutive - 1].checkedAt.getTime();
				const cappedByWindow = consecutive === recent.length && recent.length === RECENT_LIMIT;
				const outage = cappedByWindow ? '24 h or more' : humanizeDuration(now - outageStart);
				lines.push(`Failed checks in a row: ${consecutive} (down for ${outage})`);
			}

			const flapWindow = recent.slice(0, FLAP_WINDOW);
			const failed = flapWindow.filter((row) => !row.ok).length;
			if (consecutive === 0 || failed < flapWindow.length) {
				lines.push(`Recent pattern: ${failed} of the last ${flapWindow.length} checks failed (intermittent)`);
			} else {
				lines.push(`Recent pattern: every one of the last ${flapWindow.length} checks failed (hard down)`);
			}

			const healthyLatencies = recent.filter((row) => row.ok && typeof row.latencyMs === 'number').map((row) => row.latencyMs as number);
			if (healthyLatencies.length > 0) {
				lines.push(`Typical response time when healthy: about ${median(healthyLatencies)} ms`);
			}

			const lastHealthy = recent.find((row) => row.ok);
			lines.push(
				lastHealthy
					? `Last healthy check: about ${humanizeDuration(now - lastHealthy.checkedAt.getTime())} ago`
					: 'Last healthy check: none in the last 24 h',
			);

			const up = recent.filter((row) => row.ok).length;
			lines.push(`Availability: ${Math.round((up / recent.length) * 100)}% over the last 24 h (${recent.length} checks)`);
		}

		const [priorIncidents] = await db
			.select({ count: sql<number>`count(*)` })
			.from(incidents)
			.innerJoin(incidentMonitors, eq(incidentMonitors.incidentId, incidents.id))
			.where(and(eq(incidentMonitors.monitorId, monitor.id), gte(incidents.startedAt, new Date(now - 30 * DAY_MS))));
		// The incident that triggered this run is already persisted, so discount it.
		const priorCount = Math.max(0, Number(priorIncidents?.count ?? 0) - 1);
		lines.push(
			priorCount > 0
				? `Recurrence: ${priorCount} other incident${priorCount === 1 ? '' : 's'} for this service in the last 30 days`
				: 'Recurrence: first incident for this service in the last 30 days',
		);
	} catch (error) {
		console.warn(
			JSON.stringify({
				message: 'incident context enrichment failed',
				error: error instanceof Error ? error.message : String(error),
				monitorId: monitor.id,
			}),
		);
	}

	return lines.join('\n');
}
