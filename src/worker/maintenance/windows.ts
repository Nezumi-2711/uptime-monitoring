import { eq } from 'drizzle-orm';
import type { Database } from '../db/client';
import { maintenanceWindowMonitors, maintenanceWindows } from '../db/schema';

export type MaintenanceWindowRow = typeof maintenanceWindows.$inferSelect;
export type ActiveMaintenance = { windowId: number; name: string; endsAt: Date };

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timezone: string) {
	let formatter = formatterCache.get(timezone);
	if (!formatter) {
		formatter = new Intl.DateTimeFormat('en-US', {
			timeZone: timezone,
			hour: '2-digit',
			minute: '2-digit',
			hourCycle: 'h23',
		});
		formatterCache.set(timezone, formatter);
	}
	return formatter;
}

export function localMinuteOfDay(at: Date, timezone: string): number {
	const parts = formatterFor(timezone).formatToParts(at);
	const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? 0);
	const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? 0);
	return hour * 60 + minute;
}

export function isWindowActive(window: MaintenanceWindowRow, at: Date): boolean {
	if (!window.enabled) return false;
	const minute = localMinuteOfDay(at, window.timezone);
	const end = window.startMinute + window.durationMinutes;
	if (end <= 1440) return minute >= window.startMinute && minute < end;
	return minute >= window.startMinute || minute < end - 1440;
}

export function windowEndsAt(window: MaintenanceWindowRow, at: Date): Date {
	const elapsed = (localMinuteOfDay(at, window.timezone) - window.startMinute + 1440) % 1440;
	return new Date(at.getTime() + (window.durationMinutes - elapsed) * 60_000);
}

export async function loadActiveMaintenance(db: Database, at: Date): Promise<Map<number, ActiveMaintenance>> {
	const rows = await db
		.select({ window: maintenanceWindows, monitorId: maintenanceWindowMonitors.monitorId })
		.from(maintenanceWindows)
		.innerJoin(maintenanceWindowMonitors, eq(maintenanceWindowMonitors.windowId, maintenanceWindows.id))
		.where(eq(maintenanceWindows.enabled, true));

	const active = new Map<number, ActiveMaintenance>();
	for (const row of rows) {
		if (!isWindowActive(row.window, at)) continue;
		const candidate = {
			windowId: row.window.id,
			name: row.window.name,
			endsAt: windowEndsAt(row.window, at),
		};
		const current = active.get(row.monitorId);
		if (!current || candidate.endsAt > current.endsAt) active.set(row.monitorId, candidate);
	}
	return active;
}
