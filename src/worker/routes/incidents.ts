import { desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { IncidentDraftError, draftIncidentUpdate, type IncidentStatus } from '../ai/incident-draft';
import { getDb, type Database } from '../db/client';
import { incidentMonitors, incidents, incidentUpdates, monitors } from '../db/schema';
import { requireAuth, type AuthVariables } from '../lib/require-auth';
import { parseInteger } from './monitors';

const STATUSES = new Set<IncidentStatus>(['investigating', 'identified', 'monitoring', 'resolved']);
const IMPACTS = new Set(['none', 'minor', 'major', 'critical']);

type ParsedIncidentInput = {
	title?: string;
	impact?: string;
	status?: IncidentStatus;
	body?: string;
	note?: string | null;
	monitorIds?: number[];
};
type ParseResult = { ok: true; value: ParsedIncidentInput } | { ok: false; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseId(raw: string) {
	const parsed = parseInteger(Number(raw), 'id', 1, Number.MAX_SAFE_INTEGER);
	return parsed.ok ? parsed.value : null;
}

function parseLimit(raw: string | undefined, fallback = 50, maximum = 200) {
	if (!raw) return fallback;
	const parsed = parseInteger(Number(raw), 'limit', 1, maximum);
	return parsed.ok ? parsed.value : fallback;
}

function parseText(value: unknown, label: string, minimum: number, maximum: number) {
	if (typeof value !== 'string' || value.trim().length < minimum || value.trim().length > maximum) {
		return { ok: false as const, message: `${label} must be between ${minimum} and ${maximum} characters` };
	}
	return { ok: true as const, value: value.trim() };
}

export function parseIncidentInput(body: unknown, partial = false): ParseResult {
	if (!isRecord(body)) return { ok: false, message: 'Invalid request body' };
	const value: ParsedIncidentInput = {};
	if (!partial || 'title' in body) {
		const parsed = parseText(body.title, 'Title', 1, 120);
		if (!parsed.ok) return parsed;
		value.title = parsed.value;
	}
	if (!partial || 'impact' in body) {
		if (typeof body.impact !== 'string' || !IMPACTS.has(body.impact)) return { ok: false, message: 'Invalid impact' };
		value.impact = body.impact;
	}
	if (!partial || 'status' in body) {
		if (typeof body.status !== 'string' || !STATUSES.has(body.status as IncidentStatus)) {
			return { ok: false, message: 'Invalid incident status' };
		}
		value.status = body.status as IncidentStatus;
	}
	if (!partial || 'body' in body) {
		const parsed = parseText(body.body, 'Body', 1, 2000);
		if (!parsed.ok) return parsed;
		value.body = parsed.value;
	}
	if ('note' in body) {
		if (body.note !== null && (typeof body.note !== 'string' || body.note.length > 1000)) {
			return { ok: false, message: 'Note must be at most 1000 characters' };
		}
		value.note = typeof body.note === 'string' && body.note.trim() ? body.note.trim() : null;
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

async function loadMonitorIds(db: Database, incidentIds: number[]) {
	if (incidentIds.length === 0) return new Map<number, number[]>();
	const rows = await db
		.select({ incidentId: incidentMonitors.incidentId, monitorId: incidentMonitors.monitorId })
		.from(incidentMonitors)
		.where(inArray(incidentMonitors.incidentId, incidentIds));
	const result = new Map<number, number[]>();
	for (const row of rows) {
		const ids = result.get(row.incidentId);
		if (ids) ids.push(row.monitorId);
		else result.set(row.incidentId, [row.monitorId]);
	}
	return result;
}

async function loadIncident(db: Database, id: number) {
	const [incident] = await db.select().from(incidents).where(eq(incidents.id, id)).limit(1);
	if (!incident) return null;
	const [monitorIds, updates] = await Promise.all([
		loadMonitorIds(db, [id]),
		db.select().from(incidentUpdates).where(eq(incidentUpdates.incidentId, id)).orderBy(incidentUpdates.createdAt),
	]);
	return { ...incident, monitorIds: monitorIds.get(id) ?? [], updates };
}

async function readJson(context: { req: { json(): Promise<unknown> } }) {
	try {
		return { ok: true as const, body: await context.req.json() };
	} catch {
		return { ok: false as const, body: null };
	}
}

const incidentRoutes = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
incidentRoutes.use('*', requireAuth);

incidentRoutes.get('/', async (context) => {
	const db = getDb(context.env);
	const status = context.req.query('status') ?? 'open';
	if (status !== 'open' && status !== 'all') return context.json({ message: 'status must be open or all' }, 400);
	const limit = parseLimit(context.req.query('limit'));
	const rows = await db
		.select({
			id: incidents.id,
			title: incidents.title,
			status: incidents.status,
			impact: incidents.impact,
			source: incidents.source,
			startedAt: incidents.startedAt,
			resolvedAt: incidents.resolvedAt,
			durationMs: incidents.durationMs,
			createdAt: incidents.createdAt,
			updatedAt: incidents.updatedAt,
			updateCount: sql<number>`(select count(*) from incident_updates where incident_id = ${incidents.id})`,
		})
		.from(incidents)
		.where(status === 'open' ? isNull(incidents.resolvedAt) : undefined)
		.orderBy(desc(incidents.startedAt))
		.limit(limit);
	const monitorIds = await loadMonitorIds(
		db,
		rows.map((row) => row.id),
	);
	return context.json({ incidents: rows.map((row) => ({ ...row, monitorIds: monitorIds.get(row.id) ?? [] })) });
});

incidentRoutes.post('/draft', async (context) => {
	const input = await readJson(context);
	if (!input.ok || !isRecord(input.body)) return context.json({ message: 'Invalid request body' }, 400);
	const note = parseText(input.body.note, 'Note', 1, 1000);
	if (!note.ok) return context.json({ message: note.message }, 400);
	if (typeof input.body.status !== 'string' || !STATUSES.has(input.body.status as IncidentStatus)) {
		return context.json({ message: 'Invalid incident status' }, 400);
	}
	const monitorIds = input.body.monitorIds ?? [];
	if (!Array.isArray(monitorIds) || monitorIds.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
		return context.json({ message: 'monitorIds must be an array of positive integers' }, 400);
	}
	try {
		return context.json(
			await draftIncidentUpdate(context.env, {
				note: note.value,
				status: input.body.status as IncidentStatus,
				withTitle: true,
				serviceCount: new Set(monitorIds).size,
			}),
		);
	} catch (error) {
		if (error instanceof IncidentDraftError) return context.json({ message: error.message }, error.status);
		throw error;
	}
});

incidentRoutes.get('/:id', async (context) => {
	const id = parseId(context.req.param('id'));
	if (id === null) return context.json({ message: 'Incident not found' }, 404);
	const incident = await loadIncident(getDb(context.env), id);
	return incident ? context.json({ incident }) : context.json({ message: 'Incident not found' }, 404);
});

incidentRoutes.post('/', async (context) => {
	const input = await readJson(context);
	if (!input.ok) return context.json({ message: 'Invalid request body' }, 400);
	const parsed = parseIncidentInput(input.body);
	if (!parsed.ok) return context.json({ message: parsed.message }, 400);
	const db = getDb(context.env);
	const monitorIds = parsed.value.monitorIds!;
	if (!(await allMonitorsExist(db, monitorIds))) return context.json({ message: 'One or more monitors do not exist' }, 400);
	const now = Date.now();
	const statements: D1PreparedStatement[] = [
		context.env.DB.prepare(
			`INSERT INTO incidents (title, status, impact, source, started_at, resolved_at, duration_ms, created_at, updated_at)
			 VALUES (?, ?, ?, 'manual', ?, ?, ?, ?, ?)`,
		).bind(
			parsed.value.title,
			parsed.value.status,
			parsed.value.impact,
			now,
			parsed.value.status === 'resolved' ? now : null,
			parsed.value.status === 'resolved' ? 0 : null,
			now,
			now,
		),
	];
	if (monitorIds.length > 0) {
		statements.push(
			context.env.DB.prepare(
				`WITH inserted_incident(id) AS MATERIALIZED (SELECT last_insert_rowid())
				 INSERT INTO incident_monitors (incident_id, monitor_id)
				 SELECT inserted_incident.id, column1 FROM inserted_incident, (VALUES ${monitorIds.map(() => '(?)').join(', ')})`,
			).bind(...monitorIds),
		);
	}
	statements.push(
		context.env.DB.prepare(
			`INSERT INTO incident_updates (incident_id, status, body, note, source, created_at)
			 VALUES (${monitorIds.length > 0 ? '(SELECT incident_id FROM incident_monitors ORDER BY rowid DESC LIMIT 1)' : 'last_insert_rowid()'}, ?, ?, ?, 'manual', ?)`,
		).bind(parsed.value.status, parsed.value.body, parsed.value.note ?? null, now),
	);
	const results = await context.env.DB.batch(statements);
	const id = Number(results[0].meta.last_row_id);
	const incident = await loadIncident(db, id);
	return context.json({ incident }, 201);
});

incidentRoutes.patch('/:id', async (context) => {
	const id = parseId(context.req.param('id'));
	if (id === null) return context.json({ message: 'Incident not found' }, 404);
	const input = await readJson(context);
	if (!input.ok) return context.json({ message: 'Invalid request body' }, 400);
	const parsed = parseIncidentInput(input.body, true);
	if (!parsed.ok) return context.json({ message: parsed.message }, 400);
	const allowed = { title: parsed.value.title, impact: parsed.value.impact, monitorIds: parsed.value.monitorIds };
	if (Object.values(allowed).every((value) => value === undefined)) return context.json({ message: 'Provide a field to update' }, 400);
	const db = getDb(context.env);
	if (!(await loadIncident(db, id))) return context.json({ message: 'Incident not found' }, 404);
	if (parsed.value.monitorIds && !(await allMonitorsExist(db, parsed.value.monitorIds))) {
		return context.json({ message: 'One or more monitors do not exist' }, 400);
	}
	const statements = [];
	if (parsed.value.title !== undefined || parsed.value.impact !== undefined) {
		statements.push(
			db
				.update(incidents)
				.set({ title: parsed.value.title, impact: parsed.value.impact, updatedAt: new Date() })
				.where(eq(incidents.id, id)),
		);
	}
	if (parsed.value.monitorIds) {
		statements.push(db.delete(incidentMonitors).where(eq(incidentMonitors.incidentId, id)));
		statements.push(...parsed.value.monitorIds.map((monitorId) => db.insert(incidentMonitors).values({ incidentId: id, monitorId })));
	}
	if (statements.length > 0) await db.batch(statements as [(typeof statements)[number], ...typeof statements]);
	return context.json({ incident: await loadIncident(db, id) });
});

incidentRoutes.post('/:id/updates/draft', async (context) => {
	const id = parseId(context.req.param('id'));
	if (id === null) return context.json({ message: 'Incident not found' }, 404);
	const input = await readJson(context);
	if (!input.ok || !isRecord(input.body)) return context.json({ message: 'Invalid request body' }, 400);
	const note = parseText(input.body.note, 'Note', 1, 1000);
	if (!note.ok) return context.json({ message: note.message }, 400);
	if (typeof input.body.status !== 'string' || !STATUSES.has(input.body.status as IncidentStatus)) {
		return context.json({ message: 'Invalid incident status' }, 400);
	}
	const db = getDb(context.env);
	const incident = await loadIncident(db, id);
	if (!incident) return context.json({ message: 'Incident not found' }, 404);
	const previousUpdates = await db
		.select({ status: incidentUpdates.status, body: incidentUpdates.body })
		.from(incidentUpdates)
		.where(eq(incidentUpdates.incidentId, id))
		.orderBy(desc(incidentUpdates.createdAt))
		.limit(3);
	try {
		const draft = await draftIncidentUpdate(context.env, {
			note: note.value,
			status: input.body.status as IncidentStatus,
			withTitle: false,
			incidentTitle: incident.title,
			previousUpdates: previousUpdates.reverse(),
			serviceCount: incident.monitorIds.length,
		});
		return context.json({ body: draft.body });
	} catch (error) {
		if (error instanceof IncidentDraftError) return context.json({ message: error.message }, error.status);
		throw error;
	}
});

incidentRoutes.post('/:id/updates', async (context) => {
	const id = parseId(context.req.param('id'));
	if (id === null) return context.json({ message: 'Incident not found' }, 404);
	const input = await readJson(context);
	if (!input.ok) return context.json({ message: 'Invalid request body' }, 400);
	const parsed = parseIncidentInput(input.body, true);
	if (!parsed.ok) return context.json({ message: parsed.message }, 400);
	if (!parsed.value.status || !parsed.value.body) return context.json({ message: 'Status and body are required' }, 400);
	const db = getDb(context.env);
	const [existing] = await db.select().from(incidents).where(eq(incidents.id, id)).limit(1);
	if (!existing) return context.json({ message: 'Incident not found' }, 404);
	const now = new Date();
	const resolved = parsed.value.status === 'resolved';
	await db.batch([
		db.insert(incidentUpdates).values({
			incidentId: id,
			status: parsed.value.status,
			body: parsed.value.body,
			note: parsed.value.note ?? null,
			source: 'manual',
			createdAt: now,
		}),
		db
			.update(incidents)
			.set({
				status: parsed.value.status,
				resolvedAt: resolved ? now : null,
				durationMs: resolved ? Math.max(0, now.getTime() - existing.startedAt.getTime()) : null,
				updatedAt: now,
			})
			.where(eq(incidents.id, id)),
	]);
	return context.json({ incident: await loadIncident(db, id) });
});

incidentRoutes.delete('/:id', async (context) => {
	const id = parseId(context.req.param('id'));
	if (id === null) return context.json({ message: 'Incident not found' }, 404);
	const db = getDb(context.env);
	const [existing] = await db.select({ id: incidents.id }).from(incidents).where(eq(incidents.id, id)).limit(1);
	if (!existing) return context.json({ message: 'Incident not found' }, 404);
	await db.batch([
		db.delete(incidentMonitors).where(eq(incidentMonitors.incidentId, id)),
		db.delete(incidentUpdates).where(eq(incidentUpdates.incidentId, id)),
		db.delete(incidents).where(eq(incidents.id, id)),
	]);
	return context.json({ ok: true });
});

export default incidentRoutes;
