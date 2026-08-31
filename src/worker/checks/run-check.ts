import type { monitors } from '../db/schema';
import { readBodyLimited } from '../lib/read-body';

export type Monitor = typeof monitors.$inferSelect;

export type CheckResult = {
	ok: boolean;
	degraded: boolean;
	statusCode: number | null;
	latencyMs: number;
	error: string | null;
};

// Keyword matching decodes and lowercases this many bytes of the response body on the hot
// path. 64 KiB covers page titles, health-check payloads and status JSON while keeping the
// per-check CPU cost small — the free plan allows only 10 ms of CPU per invocation and one
// scheduled run decodes bodies for every keyword monitor.
export const MAX_BODY_MATCH_BYTES = 64 * 1024;

function requestHeaders(monitor: Monitor) {
	let configured: Record<string, string> = {};
	if (monitor.requestHeaders) {
		try {
			configured = JSON.parse(monitor.requestHeaders) as Record<string, string>;
		} catch {
			// Stored values are API-validated. Ignore malformed legacy values instead of failing the check.
		}
	}
	const headers = new Headers(configured);
	if (!headers.has('User-Agent')) headers.set('User-Agent', 'Upwatch/1.0 (+uptime monitor)');
	if (monitor.method === 'POST' && monitor.requestBody !== null && !headers.has('Content-Type')) {
		headers.set('Content-Type', 'application/json');
	}
	return headers;
}

export async function runCheck(monitor: Monitor): Promise<CheckResult> {
	const startedAt = Date.now();
	try {
		const response = await fetch(monitor.url, {
			method: monitor.method,
			redirect: 'follow',
			signal: AbortSignal.timeout(monitor.timeoutMs),
			headers: requestHeaders(monitor),
			body: monitor.method === 'POST' ? monitor.requestBody : undefined,
		});
		const latencyMs = Date.now() - startedAt;
		const statusOk = response.status === monitor.expectedStatus;
		let keywordOk = true;
		if (monitor.expectKeyword !== null && monitor.method !== 'HEAD') {
			const body = await readBodyLimited(response, MAX_BODY_MATCH_BYTES, true);
			const contains =
				body !== null && new TextDecoder().decode(body).toLocaleLowerCase().includes(monitor.expectKeyword.toLocaleLowerCase());
			keywordOk = monitor.keywordInverted ? !contains : contains;
		} else {
			await response.body?.cancel();
		}
		const ok = statusOk && keywordOk;
		let error: string | null = null;
		if (!statusOk) error = `Expected HTTP ${monitor.expectedStatus}, received ${response.status}`;
		else if (!keywordOk) {
			error = `${monitor.keywordInverted ? 'Response contained' : 'Response did not contain'} "${monitor.expectKeyword}"`.slice(0, 200);
		}
		return {
			ok,
			degraded: ok && monitor.degradedLatencyMs !== null && latencyMs > monitor.degradedLatencyMs,
			statusCode: response.status,
			latencyMs,
			error,
		};
	} catch (error) {
		return {
			ok: false,
			degraded: false,
			statusCode: null,
			latencyMs: Date.now() - startedAt,
			error: error instanceof Error ? error.message.slice(0, 200) : 'Request failed',
		};
	}
}

export const MAX_RETRY_COUNT = 3;
const RETRY_BACKOFF_MS = [400, 1_200, 2_500] as const;

export type CheckAttemptResult = CheckResult & { attempts: number };
export type RetryBudget = { remaining: number; deadline: number };

export async function runCheckWithRetries(monitor: Monitor, budget?: RetryBudget): Promise<CheckAttemptResult> {
	let result = await runCheck(monitor);
	if (result.ok) return { ...result, attempts: 1 };

	const allowed = Math.min(Math.max(0, monitor.retryCount), MAX_RETRY_COUNT);
	let attempts = 1;
	for (let retry = 0; retry < allowed; retry += 1) {
		if (budget && (budget.remaining <= 0 || Date.now() >= budget.deadline)) break;
		if (budget) budget.remaining -= 1;
		await new Promise((resolve) => setTimeout(resolve, RETRY_BACKOFF_MS[Math.min(retry, RETRY_BACKOFF_MS.length - 1)]));
		result = await runCheck(monitor);
		attempts += 1;
		if (result.ok) break;
	}
	return { ...result, attempts };
}
