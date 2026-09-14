import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PublicService } from '../api/status';
import { uptimeWindows } from './monitor-status';

const DAY_MS = 24 * 60 * 60 * 1000;
const TODAY = Date.UTC(2026, 8, 14);

function service(history: PublicService['history']): PublicService {
	return {
		id: 1,
		name: 'Example site',
		status: 'up',
		message: null,
		maintenance: null,
		lastCheckedAt: null,
		uptime90d: null,
		history,
	};
}

describe('uptimeWindows', () => {
	afterEach(() => vi.useRealTimers());

	it('returns empty windows without a service or history', () => {
		vi.setSystemTime(new Date('2026-09-14T12:00:00Z'));
		expect(uptimeWindows(undefined)).toEqual({ today: null, d7: null, d30: null });
		expect(uptimeWindows(service([]))).toEqual({ today: null, d7: null, d30: null });
	});

	it('uses the current UTC bucket for today', () => {
		vi.setSystemTime(new Date('2026-09-14T12:00:00Z'));
		expect(uptimeWindows(service([{ day: TODAY, uptimePct: 99.5 }]))).toEqual({ today: 99.5, d7: 99.5, d30: 99.5 });
	});

	it('does not mistake yesterday for today', () => {
		vi.setSystemTime(new Date('2026-09-14T12:00:00Z'));
		expect(uptimeWindows(service([{ day: TODAY - DAY_MS, uptimePct: 98 }]))).toEqual({ today: null, d7: 98, d30: 98 });
	});

	it('excludes old and null buckets from the shorter average', () => {
		vi.setSystemTime(new Date('2026-09-14T12:00:00Z'));
		const uptime = uptimeWindows(
			service([
				{ day: TODAY, uptimePct: 100 },
				{ day: TODAY - DAY_MS, uptimePct: null },
				{ day: TODAY - 7 * DAY_MS, uptimePct: 80 },
			]),
		);

		expect(uptime).toEqual({ today: 100, d7: 100, d30: 90 });
	});
});
