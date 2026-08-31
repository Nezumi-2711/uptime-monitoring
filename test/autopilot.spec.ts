import { applyD1Migrations, type D1Migration } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';
import { advanceStatus, computeImpact, nextFollowupDueAt } from '../src/worker/autopilot/cadence';
import { recordAiEvent } from '../src/worker/ai/events';
import { sanitizePublicTextWithReason } from '../src/worker/ai/sanitize';
import { AI_EVENT_RETENTION_MS, cleanupExpiredAuthRecords } from '../src/worker/scheduled/cleanup';

describe('incident autopilot', () => {
	beforeAll(async () => {
		const testEnv = env as Env & { TEST_MIGRATIONS: D1Migration[] };
		await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);
	});

	it('uses exponential cadence capped at eight times the configured interval', () => {
		const start = 1_000_000;
		expect(nextFollowupDueAt(start, 1, 15)).toBe(start + 15 * 60_000);
		expect(nextFollowupDueAt(start, 2, 15)).toBe(start + 30 * 60_000);
		expect(nextFollowupDueAt(start, 4, 15)).toBe(start + 120 * 60_000);
		expect(nextFollowupDueAt(start, 9, 15)).toBe(start + 120 * 60_000);
	});

	it('advances only from objective signals', () => {
		expect(
			advanceStatus('investigating', {
				consecutiveFailures: 3,
				failureSignatureStable: true,
				consecutiveOk: 0,
				latestOk: false,
				regressionUsed: false,
			}),
		).toBe('identified');
		expect(
			advanceStatus('identified', {
				consecutiveFailures: 0,
				failureSignatureStable: false,
				consecutiveOk: 2,
				latestOk: true,
				regressionUsed: false,
			}),
		).toBe('monitoring');
	});

	it('computes impact deterministically', () => {
		expect(computeImpact({ kind: 'degraded', affectedMonitors: 5, totalMonitors: 5, recentChecks: [] })).toBe('minor');
		expect(computeImpact({ kind: 'down', affectedMonitors: 2, totalMonitors: 4, recentChecks: [false] })).toBe('critical');
		expect(computeImpact({ kind: 'down', affectedMonitors: 1, totalMonitors: 4, recentChecks: [false, true] })).toBe('minor');
	});

	it('returns actionable sanitizer rejection reasons', () => {
		expect(sanitizePublicTextWithReason('See https://private.example', 200)).toEqual({ text: null, reason: 'contains_url' });
		expect(sanitizePublicTextWithReason('HTTP 503 is occurring', 200)).toEqual({ text: null, reason: 'contains_http_status' });
		expect(sanitizePublicTextWithReason('A calm public update.', 200)).toEqual({ text: 'A calm public update.', reason: null });
	});

	it('removes AI audit rows after the retention period', async () => {
		await env.DB.prepare('DELETE FROM ai_events').run();
		await env.DB.prepare("INSERT INTO ai_events (kind, outcome, created_at) VALUES ('settings_test', 'ok', ?)")
			.bind(Date.now() - AI_EVENT_RETENTION_MS - 1)
			.run();
		await cleanupExpiredAuthRecords(env);
		expect((await env.DB.prepare('SELECT count(*) AS count FROM ai_events').first<{ count: number }>())?.count).toBe(0);
	});

	it('redacts sensitive values from AI audit previews', async () => {
		await env.DB.prepare('DELETE FROM ai_events').run();
		await recordAiEvent(env, {
			kind: 'settings_test',
			outcome: 'rejected',
			reason: 'Failed at https://private.example.com with sk-secret-4f2a',
			contextPreview: 'Probe https://api.example.com from 10.0.0.1 using Bearer private-token',
			outputPreview: 'Visit status.example.com with sk-output-secret',
		});
		const text = JSON.stringify(await env.DB.prepare('SELECT reason, context_preview, output_preview FROM ai_events').first());
		expect(text).not.toContain('private.example.com');
		expect(text).not.toContain('api.example.com');
		expect(text).not.toContain('10.0.0.1');
		expect(text).not.toContain('private-token');
		expect(text).not.toContain('sk-secret-4f2a');
	});
});
