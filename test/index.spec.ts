import { exports as worker } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { shouldRunFiveMinuteWork } from '../src/worker';

describe('uptime monitoring Worker', () => {
	it('runs housekeeping only on five-minute UTC boundaries', () => {
		expect(shouldRunFiveMinuteWork(Date.parse('2026-09-02T12:10:00Z'))).toBe(true);
		expect(shouldRunFiveMinuteWork(Date.parse('2026-09-02T12:11:00Z'))).toBe(false);
	});

	it('returns a successful D1 health response', async () => {
		const response = await worker.default.fetch('https://example.com/api/health');
		const body = await response.json<{
			ok: boolean;
			db: { ok: number } | null;
			ts: number;
		}>();

		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toContain('application/json');
		expect(body.ok).toBe(true);
		expect(body.db).toEqual({ ok: 1 });
		expect(body.ts).toEqual(expect.any(Number));
	});
});
