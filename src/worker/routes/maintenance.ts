import { eq, inArray } from 'drizzle-orm';
import { Hono } from 'hono';
import { getDb, type Database } from '../db/client';
import { maintenanceWindowMonitors, maintenanceWindows, monitors } from '../db/schema';
import { requireAuth, type AuthVariables } from '../lib/require-auth';
import { isWindowActive } from '../maintenance/windows';
import { parseInteger } from './monitors';

type ParsedMaintenanceWindowInput = {
	name?: string;
	startMinute?: number;
	durationMinutes?: number;
	timezone?: string;
	enabled?: boolean;
	monitorIds?: number[];
};

type ParseResult = { ok: true; value: ParsedMaintenanceWindowInput } | { ok: false; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseId(rawId: string) {
	const id = Number(rawId);
	return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function parseMaintenanceWindowInput(body: unknown, partial = false): ParseResult {
	if (!isRecord(body)) return { ok: false, message: 'Invalid request body' };
	const value: ParsedMaintenanceWindowInput = {};

	if (!partial || 'name' in body) {
		if (typeof body.name !== 'string' || body.name.trim().length < 1 || body.name.trim().length > 100) {
			return { ok: false, message: 'Name must be between 1 and 100 characters' };
		}
		value.name = body.name.trim();
	}

	for (const [key, label, minimum, maximum] of [
		['startMinute', 'startMinute', 0, 1439],
		['durationMinutes', 'durationMinutes', 1, 1440],
	] as const) {
		if (!partial || key in body) {
			const parsed = parseInteger(body[key], label, minimum, maximum);
			if (!parsed.ok) return parsed;
			value[key] = parsed.value;
		}
	}

	if (!partial || 'timezone' in body) {
		if (typeof body.timezone !== 'string' || body.timezone.length === 0 || body.timezone.length > 100) {
			return { ok: false, message: 'Enter a valid IANA timezone' };
		}
		try {
			new Intl.DateTimeFormat('en-US', { timeZone: body.timezone }).format();
		} catch {
			return { ok: false, message: 'Enter a valid IANA timezone' };
		}
		value.timezone = body.timezone;
	}

	if ('enabled' in body) {
		if (typeof body.enabled !== 'boolean') return { ok: false, message: 'enabled must be a boolean' };
		value.enabled = body.enabled;
	}

	if (!partial || 'monitorIds' in body) {
		if (!Array.isArray(body.monitorIds) || body.monitorIds.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
			return { ok: false, message: 'monitorIds must be an array of positive integers' };
		}
		value.monitorIds = [...new Set(body.monitorIds as number[])];
	}

	return { ok: true, value };
}

async function allMonitorsExist(db: Database, monitorIds: number[]) {
	if (monitorIds.length === 0) return true;
	const rows = await db.select({ id: monitors.id }).from(monitors).where(inArray(monitors.id, monitorIds));
	return rows.length === monitorIds.length;
}

const maintenanceRoutes = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
maintenanceRoutes.use('*', requireAuth);

maintenanceRoutes.get('/', async (context) => {
	const db = getDb(context.env);
	const [windows, assignments] = await Promise.all([
		db.select().from(maintenanceWindows).orderBy(maintenanceWindows.createdAt),
		db.select().from(maintenanceWindowMonitors),
	]);
	const idsByWindow = new Map<number, number[]>();
	for (const assignment of assignments) {
		const ids = idsByWindow.get(assignment.windowId);
		if (ids) ids.push(assignment.monitorId);
		else idsByWindow.set(assignment.windowId, [assignment.monitorId]);
	}
	const now = new Date();
	return context.json({
		windows: windows.map((window) => ({
			...window,
			monitorIds: idsByWindow.get(window.id) ?? [],
			active: isWindowActive(window, now),
		})),
	});
});

maintenanceRoutes.post('/', async (context) => {
	let body: unknown;
	try {
		body = await context.req.json();
	} catch {
		return context.json({ message: 'Invalid request body' }, 400);
	}
	const parsed = parseMaintenanceWindowInput(body);
	if (!parsed.ok) return context.json({ message: parsed.message }, 400);

	const db = getDb(context.env);
	const monitorIds = parsed.value.monitorIds!;
	if (!(await allMonitorsExist(db, monitorIds))) return context.json({ message: 'One or more monitors do not exist' }, 400);

	const now = new Date();
	const results = await context.env.DB.batch([
		context.env.DB.prepare(
			'INSERT INTO maintenance_windows (name, start_minute, duration_minutes, timezone, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
		).bind(
			parsed.value.name!,
			parsed.value.startMinute!,
			parsed.value.durationMinutes!,
			parsed.value.timezone!,
			parsed.value.enabled === false ? 0 : 1,
			now.getTime(),
			now.getTime(),
		),
		...monitorIds.map((monitorId) =>
			context.env.DB.prepare(
				'INSERT INTO maintenance_window_monitors (window_id, monitor_id) VALUES ((SELECT max(id) FROM maintenance_windows), ?)',
			).bind(monitorId),
		),
	]);
	const id = Number(results[0].meta.last_row_id);
	const window = await context.env.DB.prepare('SELECT * FROM maintenance_windows WHERE id = ?').bind(id).first<{
		id: number;
		name: string;
		start_minute: number;
		duration_minutes: number;
		timezone: string;
		enabled: number;
		created_at: number;
		updated_at: number;
	}>();
	if (!window) return context.json({ message: 'Unable to create maintenance window' }, 500);
	const serialized = {
		id: window.id,
		name: window.name,
		startMinute: window.start_minute,
		durationMinutes: window.duration_minutes,
		timezone: window.timezone,
		enabled: window.enabled === 1,
		createdAt: new Date(window.created_at),
		updatedAt: new Date(window.updated_at),
	};
	return context.json({ window: { ...serialized, monitorIds, active: isWindowActive(serialized, new Date()) } }, 201);
});

maintenanceRoutes.patch('/:id', async (context) => {
	const id = parseId(context.req.param('id'));
	if (id === null) return context.json({ message: 'Maintenance window not found' }, 404);
	let body: unknown;
	try {
		body = await context.req.json();
	} catch {
		return context.json({ message: 'Invalid request body' }, 400);
	}
	const parsed = parseMaintenanceWindowInput(body, true);
	if (!parsed.ok) return context.json({ message: parsed.message }, 400);
	if (Object.keys(parsed.value).length === 0) return context.json({ message: 'Provide at least one field to update' }, 400);

	const db = getDb(context.env);
	const [existing] = await db.select().from(maintenanceWindows).where(eq(maintenanceWindows.id, id)).limit(1);
	if (!existing) return context.json({ message: 'Maintenance window not found' }, 404);
	if (parsed.value.monitorIds && !(await allMonitorsExist(db, parsed.value.monitorIds))) {
		return context.json({ message: 'One or more monitors do not exist' }, 400);
	}

	const { monitorIds, ...changes } = parsed.value;
	const statements = [
		db
			.update(maintenanceWindows)
			.set({ ...changes, updatedAt: new Date() })
			.where(eq(maintenanceWindows.id, id)),
	];
	if (monitorIds) {
		statements.push(db.delete(maintenanceWindowMonitors).where(eq(maintenanceWindowMonitors.windowId, id)));
		statements.push(...monitorIds.map((monitorId) => db.insert(maintenanceWindowMonitors).values({ windowId: id, monitorId })));
	}
	await db.batch(statements as [(typeof statements)[number], ...typeof statements]);
	const [window] = await db.select().from(maintenanceWindows).where(eq(maintenanceWindows.id, id)).limit(1);
	const assignments = await db
		.select({ monitorId: maintenanceWindowMonitors.monitorId })
		.from(maintenanceWindowMonitors)
		.where(eq(maintenanceWindowMonitors.windowId, id));
	return context.json({
		window: { ...window, monitorIds: assignments.map((row) => row.monitorId), active: isWindowActive(window, new Date()) },
	});
});

maintenanceRoutes.delete('/:id', async (context) => {
	const id = parseId(context.req.param('id'));
	if (id === null) return context.json({ message: 'Maintenance window not found' }, 404);
	const db = getDb(context.env);
	const [window] = await db.select({ id: maintenanceWindows.id }).from(maintenanceWindows).where(eq(maintenanceWindows.id, id)).limit(1);
	if (!window) return context.json({ message: 'Maintenance window not found' }, 404);
	await db.batch([
		db.delete(maintenanceWindowMonitors).where(eq(maintenanceWindowMonitors.windowId, id)),
		db.delete(maintenanceWindows).where(eq(maintenanceWindows.id, id)),
	]);
	return context.json({ ok: true });
});

export default maintenanceRoutes;
