/**
 * Environment-tunable runtime knobs.
 *
 * Cloudflare's free plan caps a Worker invocation at 50 subrequests and 10 ms CPU, and the
 * minute cron runs checks, retries, notifications and AI autopilot inside a single
 * invocation. The defaults below keep a healthy run well under that ceiling and make a large
 * correlated outage shed the least-critical work first (AI, then retries) instead of failing
 * mid-batch. Raise them with same-named environment variables on the Workers Paid plan, where
 * the ceiling is 1,000 subrequests and 5 minutes of CPU.
 */

export type RunLimits = {
	/** Immediate check retries attempted across one scheduled run, shared by every monitor. */
	retryAttemptsPerRun: number;
	/** Alert deliveries attempted across one scheduled run. */
	notificationsPerRun: number;
	/** AI completion calls attempted across one autopilot pass. */
	aiCallsPerRun: number;
	/** AI follow-up updates queued across one autopilot pass. */
	aiFollowupCallsPerRun: number;
};

export type CheckRunConfig = {
	/** Maximum monitor fetches started by one scheduled invocation. */
	maxMonitorsPerRun: number;
	/** Maximum target requests in flight at once. */
	concurrency: number;
};

export const DEFAULT_RUN_LIMITS: RunLimits = {
	retryAttemptsPerRun: 15,
	notificationsPerRun: 12,
	aiCallsPerRun: 4,
	aiFollowupCallsPerRun: 2,
};

export const DEFAULT_CHECK_RUN_CONFIG: CheckRunConfig = {
	maxMonitorsPerRun: 40,
	concurrency: 6,
};

/** Seconds the public status responses are held in the edge cache. 0 disables edge caching. */
export const DEFAULT_STATUS_CACHE_SECONDS = 60;

type EnvVars = Record<string, string | undefined>;

function boundedInt(raw: string | undefined, fallback: number, minimum: number): number {
	if (raw === undefined) return fallback;
	const value = Number(raw);
	return Number.isInteger(value) && value >= minimum ? value : fallback;
}

export function resolveRunLimits(env: Env): RunLimits {
	const vars = env as unknown as EnvVars;
	return {
		retryAttemptsPerRun: boundedInt(vars.RETRY_ATTEMPTS_PER_RUN, DEFAULT_RUN_LIMITS.retryAttemptsPerRun, 1),
		notificationsPerRun: boundedInt(vars.NOTIFICATIONS_PER_RUN, DEFAULT_RUN_LIMITS.notificationsPerRun, 1),
		aiCallsPerRun: boundedInt(vars.AI_CALLS_PER_RUN, DEFAULT_RUN_LIMITS.aiCallsPerRun, 1),
		aiFollowupCallsPerRun: boundedInt(vars.AI_FOLLOWUP_CALLS_PER_RUN, DEFAULT_RUN_LIMITS.aiFollowupCallsPerRun, 1),
	};
}

export function resolveCheckRunConfig(env: Env): CheckRunConfig {
	const vars = env as unknown as EnvVars;
	return {
		maxMonitorsPerRun: boundedInt(vars.MAX_MONITORS_PER_RUN, DEFAULT_CHECK_RUN_CONFIG.maxMonitorsPerRun, 1),
		concurrency: boundedInt(vars.CHECK_CONCURRENCY, DEFAULT_CHECK_RUN_CONFIG.concurrency, 1),
	};
}

export function resolveStatusCacheSeconds(env: Env): number {
	return boundedInt((env as unknown as EnvVars).STATUS_CACHE_SECONDS, DEFAULT_STATUS_CACHE_SECONDS, 0);
}
