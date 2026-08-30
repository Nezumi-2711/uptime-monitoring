import type { monitors } from '../db/schema';

export type Monitor = typeof monitors.$inferSelect;

export type CheckResult = {
	ok: boolean;
	statusCode: number | null;
	latencyMs: number;
	error: string | null;
};

export async function runCheck(monitor: Monitor): Promise<CheckResult> {
	const startedAt = Date.now();
	try {
		const response = await fetch(monitor.url, {
			method: monitor.method,
			redirect: 'follow',
			signal: AbortSignal.timeout(monitor.timeoutMs),
			headers: { 'User-Agent': 'Upwatch/1.0 (+uptime monitor)' },
		});
		await response.body?.cancel();
		const ok = response.status === monitor.expectedStatus;
		return {
			ok,
			statusCode: response.status,
			latencyMs: Date.now() - startedAt,
			error: ok ? null : `Expected HTTP ${monitor.expectedStatus}, received ${response.status}`,
		};
	} catch (error) {
		return {
			ok: false,
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
