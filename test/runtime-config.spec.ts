import { describe, expect, it } from 'vitest';
import {
	DEFAULT_RUN_LIMITS,
	DEFAULT_STATUS_CACHE_SECONDS,
	resolveRunLimits,
	resolveStatusCacheSeconds,
} from '../src/worker/lib/runtime-config';

const asEnv = (vars: Record<string, string>) => vars as unknown as Env;

describe('resolveRunLimits', () => {
	it('returns the free-plan defaults when nothing is configured', () => {
		expect(resolveRunLimits(asEnv({}))).toEqual(DEFAULT_RUN_LIMITS);
	});

	it('applies same-named environment overrides', () => {
		expect(
			resolveRunLimits(
				asEnv({
					RETRY_ATTEMPTS_PER_RUN: '60',
					NOTIFICATIONS_PER_RUN: '40',
					AI_CALLS_PER_RUN: '12',
					AI_FOLLOWUP_CALLS_PER_RUN: '6',
				}),
			),
		).toEqual({ retryAttemptsPerRun: 60, notificationsPerRun: 40, aiCallsPerRun: 12, aiFollowupCallsPerRun: 6 });
	});

	it('falls back to the default for non-positive or non-integer values', () => {
		expect(resolveRunLimits(asEnv({ RETRY_ATTEMPTS_PER_RUN: '0' })).retryAttemptsPerRun).toBe(DEFAULT_RUN_LIMITS.retryAttemptsPerRun);
		expect(resolveRunLimits(asEnv({ NOTIFICATIONS_PER_RUN: '-5' })).notificationsPerRun).toBe(DEFAULT_RUN_LIMITS.notificationsPerRun);
		expect(resolveRunLimits(asEnv({ AI_CALLS_PER_RUN: 'lots' })).aiCallsPerRun).toBe(DEFAULT_RUN_LIMITS.aiCallsPerRun);
		expect(resolveRunLimits(asEnv({ AI_FOLLOWUP_CALLS_PER_RUN: '2.5' })).aiFollowupCallsPerRun).toBe(
			DEFAULT_RUN_LIMITS.aiFollowupCallsPerRun,
		);
	});
});

describe('resolveStatusCacheSeconds', () => {
	it('defaults to DEFAULT_STATUS_CACHE_SECONDS', () => {
		expect(resolveStatusCacheSeconds(asEnv({}))).toBe(DEFAULT_STATUS_CACHE_SECONDS);
	});

	it('accepts 0 to disable edge caching', () => {
		expect(resolveStatusCacheSeconds(asEnv({ STATUS_CACHE_SECONDS: '0' }))).toBe(0);
	});

	it('accepts a positive override and rejects invalid values', () => {
		expect(resolveStatusCacheSeconds(asEnv({ STATUS_CACHE_SECONDS: '120' }))).toBe(120);
		expect(resolveStatusCacheSeconds(asEnv({ STATUS_CACHE_SECONDS: '-1' }))).toBe(DEFAULT_STATUS_CACHE_SECONDS);
		expect(resolveStatusCacheSeconds(asEnv({ STATUS_CACHE_SECONDS: 'nope' }))).toBe(DEFAULT_STATUS_CACHE_SECONDS);
	});
});
