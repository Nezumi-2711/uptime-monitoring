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
