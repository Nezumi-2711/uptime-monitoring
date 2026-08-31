import { and, eq, isNull, sql } from 'drizzle-orm';
import { requestCompletionDetailed, type CompletionResult } from '../ai/client';
import { DEGRADED_RECOVERY_UPDATE_BODY, RECOVERY_UPDATE_BODY } from '../ai/fallback-message';
import { buildIncidentContext } from '../ai/incident-context';
import { recordAiEvent, type AiEventKind } from '../ai/events';
import {
	AUTOPILOT_STATUS_GUIDANCE,
	INCIDENT_FOLLOWUP_SYSTEM_PROMPT,
	INCIDENT_OPEN_SYSTEM_PROMPT,
	INCIDENT_RESOLVE_SYSTEM_PROMPT,
} from '../ai/autopilot-prompts';
import { sanitizePublicTextWithReason } from '../ai/sanitize';
import type { CheckResult, Monitor } from '../checks/run-check';
import { getDb } from '../db/client';
import { aiSettings, incidentUpdates, incidents } from '../db/schema';
import { humanizeDuration } from '../lib/humanize';
import { resolveRunLimits } from '../lib/runtime-config';
import { advanceStatus, computeImpact, nextFollowupDueAt, type AutopilotIncidentStatus } from './cadence';
import { loadIncidentSignal, findLatestAutoIncidentForMonitor } from './signal';

// Per-pass ceilings come from resolveRunLimits(env): AI_CALLS_PER_RUN / AI_FOLLOWUP_CALLS_PER_RUN,
// defaulting to DEFAULT_RUN_LIMITS. They keep one autopilot pass within the free-plan subrequest budget.
export const AUTOPILOT_CONCURRENCY = 4;
export const AUTOPILOT_DEADLINE_MS = 45_000;

export type AiBudget = { remaining: number; deadline?: number };
export type AutopilotEvent = {
	monitor: Monitor;
	result: CheckResult;
	transition: 'opened' | 'resolved' | null;
	latencyTransition: 'degraded' | 'recovered' | null;
	checkedAt: Date;
};
export type AutopilotSummary = { calls: number; written: number; rejected: number; failed: number; skipped: number };

type Settings = typeof aiSettings.$inferSelect;
type Task = { kind: AiEventKind; incidentId: number; monitorId: number; run: () => Promise<boolean> };

function completionEvent(result: CompletionResult) {
	return {
		latencyMs: result.latencyMs,
		promptTokens: result.promptTokens,
		completionTokens: result.completionTokens,
		outputPreview: result.content,
	};
}

async function complete(settings: Settings, system: string, user: string, maxTokens = 180) {
	return requestCompletionDetailed(
		{ baseUrl: settings.baseUrl!, apiKey: settings.apiKey!, model: settings.model! },
		system,
		user,
		maxTokens,
	);
}

async function writeCasUpdate(
	env: Env,
	incident: typeof incidents.$inferSelect,
	status: string,
	body: string,
	now: number,
): Promise<boolean> {
	const results = await env.DB.batch([
		env.DB.prepare(
			`INSERT INTO incident_updates (incident_id, status, body, source, created_at)
			 SELECT i.id, ?, ?, 'ai', ? FROM incidents i
			 WHERE i.id = ? AND i.source = 'auto' AND i.resolved_at IS NULL AND i.updated_at = ?
			   AND NOT EXISTS (SELECT 1 FROM incident_updates m WHERE m.incident_id = i.id AND m.source = 'manual')`,
		).bind(status, body, now, incident.id, incident.updatedAt.getTime()),
		env.DB.prepare(
			`UPDATE incidents SET status = ?, updated_at = ?
			 WHERE id = ? AND source = 'auto' AND resolved_at IS NULL AND updated_at = ?
			   AND NOT EXISTS (SELECT 1 FROM incident_updates m WHERE m.incident_id = incidents.id AND m.source = 'manual')`,
		).bind(status, now, incident.id, incident.updatedAt.getTime()),
	]);
	return Number(results[0].meta.changes ?? 0) === 1 && Number(results[1].meta.changes ?? 0) === 1;
}

async function processOpening(env: Env, settings: Settings, event: AutopilotEvent, incidentId: number, kind: 'down' | 'degraded') {
	const db = getDb(env);
	const [incident] = await db.select().from(incidents).where(eq(incidents.id, incidentId)).limit(1);
	if (!incident || incident.resolvedAt || incident.source !== 'auto') return false;
	const signal = await loadIncidentSignal(db, incident.id);
	if (!signal) return false;
	const context = await buildIncidentContext(db, event.monitor, event.result);
	const result = await complete(settings, INCIDENT_OPEN_SYSTEM_PROMPT, context, 220);
	if (!result.content) {
		await recordAiEvent(env, {
			kind: kind === 'degraded' ? 'degraded_open' : 'incident_open',
			incidentId,
			monitorId: event.monitor.id,
			model: settings.model,
			outcome: 'failed',
			reason: result.failure,
			contextPreview: context,
			...completionEvent(result),
		});
		return false;
	}
	const titleRaw = result.content.match(/(?:^|\n)TITLE:\s*(.+?)(?=\nBODY:|$)/is)?.[1] ?? '';
	const bodyRaw = result.content.match(/(?:^|\n)BODY:\s*([\s\S]+)$/i)?.[1] ?? '';
	const title = sanitizePublicTextWithReason(titleRaw, 120);
	const body = sanitizePublicTextWithReason(bodyRaw, 280);
	const impact = computeImpact({
		kind,
		affectedMonitors: signal.affectedMonitors,
		totalMonitors: signal.totalMonitors,
		recentChecks: signal.recentChecks.map((check) => check.ok),
	});
	const now = Date.now();
	const statements: D1PreparedStatement[] = [];
	if (body.text) {
		statements.push(
			env.DB.prepare(
				`INSERT INTO incident_updates (incident_id, status, body, source, created_at)
				 SELECT i.id, i.status, ?, 'ai', ? FROM incidents i
				 WHERE i.id = ? AND i.source = 'auto' AND i.resolved_at IS NULL AND i.updated_at = ?
				   AND NOT EXISTS (SELECT 1 FROM incident_updates u WHERE u.incident_id = i.id)`,
			).bind(body.text, now, incident.id, incident.updatedAt.getTime()),
		);
	}
	statements.push(
		env.DB.prepare(
			`UPDATE incidents SET title = coalesce(?, title), impact = ?, updated_at = ?
			 WHERE id = ? AND source = 'auto' AND resolved_at IS NULL AND updated_at = ? AND title IS NULL
			   AND NOT EXISTS (SELECT 1 FROM incident_updates m WHERE m.incident_id = incidents.id AND m.source = 'manual')`,
		).bind(title.text, impact, now, incident.id, incident.updatedAt.getTime()),
	);
	const writeResults = await env.DB.batch(statements);
	const wrote = writeResults.some((writeResult) => Number(writeResult.meta.changes ?? 0) > 0);
	await recordAiEvent(env, {
		kind: kind === 'degraded' ? 'degraded_open' : 'incident_open',
		incidentId,
		monitorId: event.monitor.id,
		model: settings.model,
		outcome: title.text || body.text ? (wrote ? 'ok' : 'skipped_standdown') : 'rejected',
		reason:
			[title.reason && `title:${title.reason}`, body.reason && `body:${body.reason}`].filter(Boolean).join(',') ||
			(wrote ? null : 'cas_conflict_or_manual_update'),
		contextPreview: context,
		...completionEvent(result),
	});
	return wrote;
}

async function processResolution(env: Env, settings: Settings, event: AutopilotEvent, incidentId: number, fallbackBody: string) {
	const db = getDb(env);
	const [incident] = await db.select().from(incidents).where(eq(incidents.id, incidentId)).limit(1);
	if (!incident?.resolvedAt) return false;
	const context = `Service name: ${event.monitor.name}\nObserved recovery: automated checks are healthy\nIncident duration: ${humanizeDuration(incident.durationMs ?? incident.resolvedAt.getTime() - incident.startedAt.getTime())}`;
	const result = await complete(settings, INCIDENT_RESOLVE_SYSTEM_PROMPT, context);
	const sanitized = result.content ? sanitizePublicTextWithReason(result.content, 280) : { text: null, reason: null };
	let wrote = false;
	if (sanitized.text) {
		const write = await env.DB.prepare(
			`UPDATE incident_updates SET body = ?, source = 'ai'
			 WHERE id = (
				SELECT iu.id FROM incident_updates iu
				WHERE iu.incident_id = ? AND iu.status = 'resolved' AND iu.source = 'system'
				  AND iu.body = ?
				  AND NOT EXISTS (
					SELECT 1 FROM incident_updates manual
					WHERE manual.incident_id = iu.incident_id AND manual.source = 'manual'
				  )
				ORDER BY iu.id DESC LIMIT 1
			)`,
		)
			.bind(sanitized.text, incidentId, fallbackBody)
			.run();
		wrote = Number(write.meta.changes ?? 0) === 1;
	}
	await recordAiEvent(env, {
		kind: 'incident_resolve',
		incidentId,
		monitorId: event.monitor.id,
		model: settings.model,
		outcome: sanitized.text ? (wrote ? 'ok' : 'skipped_standdown') : result.failure ? 'failed' : 'rejected',
		reason: result.failure ?? sanitized.reason ?? (wrote ? null : 'manual_update_or_already_rewritten'),
		contextPreview: context,
		...completionEvent(result),
	});
	return wrote;
}

async function processFollowup(env: Env, settings: Settings, incident: typeof incidents.$inferSelect) {
	const db = getDb(env);
	const signal = await loadIncidentSignal(db, incident.id);
	if (!signal) return false;
	const status = settings.autopilotAdvanceStatus
		? advanceStatus(incident.status as AutopilotIncidentStatus, signal)
		: (incident.status as AutopilotIncidentStatus);
	const guidance = AUTOPILOT_STATUS_GUIDANCE[status === 'resolved' ? 'monitoring' : status];
	const context = [
		`Service name: ${signal.monitor.name}`,
		`Incident age: ${humanizeDuration(Date.now() - incident.startedAt.getTime())}`,
		`Current state: ${status}`,
		`Recent checks: ${signal.recentChecks.filter((check) => check.ok).length} healthy of ${signal.recentChecks.length}`,
		`Writing guidance: ${guidance}`,
	].join('\n');
	const result = await complete(settings, INCIDENT_FOLLOWUP_SYSTEM_PROMPT, context);
	const sanitized = result.content ? sanitizePublicTextWithReason(result.content, 280) : { text: null, reason: null };
	const wrote = sanitized.text ? await writeCasUpdate(env, incident, status, sanitized.text, Date.now()) : false;
	await recordAiEvent(env, {
		kind: 'incident_followup',
		incidentId: incident.id,
		monitorId: signal.monitor.id,
		model: settings.model,
		outcome: sanitized.text ? (wrote ? 'ok' : 'skipped_standdown') : result.failure ? 'failed' : 'rejected',
		reason: result.failure ?? sanitized.reason ?? (wrote ? null : 'cas_conflict_or_manual_update'),
		contextPreview: context,
		...completionEvent(result),
	});
	return wrote;
}

async function loadFollowupTasks(env: Env, settings: Settings, excluded: Set<number>): Promise<Task[]> {
	const db = getDb(env);
	const maxFollowups = resolveRunLimits(env).aiFollowupCallsPerRun;
	const rows = await db
		.select({
			incident: incidents,
			lastUpdateAt: sql<number>`coalesce(max(${incidentUpdates.createdAt}), ${incidents.startedAt})`,
			autoUpdateCount: sql<number>`coalesce(sum(case when ${incidentUpdates.source} in ('ai','system') then 1 else 0 end), 0)`,
			hasManual: sql<number>`coalesce(max(case when ${incidentUpdates.source} = 'manual' then 1 else 0 end), 0)`,
		})
		.from(incidents)
		.leftJoin(incidentUpdates, eq(incidentUpdates.incidentId, incidents.id))
		.where(and(eq(incidents.source, 'auto'), isNull(incidents.resolvedAt)))
		.groupBy(incidents.id)
		.orderBy(sql`coalesce(max(${incidentUpdates.createdAt}), ${incidents.startedAt}) asc`);
	const tasks: Task[] = [];
	for (const row of rows) {
		if (excluded.has(row.incident.id)) continue;
		if (Number(row.hasManual) > 0) {
			const [alreadyLogged] = await db
				.select({ id: sql<number>`id` })
				.from(sql`ai_events`)
				.where(sql`incident_id = ${row.incident.id} and kind = 'incident_followup' and outcome = 'skipped_standdown'`)
				.limit(1);
			if (alreadyLogged) continue;
			const [monitor] = await db
				.select({ id: sql<number>`monitor_id` })
				.from(sql`incident_monitors`)
				.where(sql`incident_id = ${row.incident.id}`)
				.limit(1);
			await recordAiEvent(env, {
				kind: 'incident_followup',
				incidentId: row.incident.id,
				monitorId: monitor?.id ?? null,
				model: settings.model,
				outcome: 'skipped_standdown',
				reason: 'manual_update_present',
			});
			continue;
		}
		const count = Number(row.autoUpdateCount);
		if (count >= settings.autopilotMaxUpdates) continue;
		const last = row.lastUpdateAt instanceof Date ? row.lastUpdateAt.getTime() : Number(row.lastUpdateAt);
		if (Date.now() < nextFollowupDueAt(last, count, settings.autopilotFollowupMinutes)) continue;
		const signal = await loadIncidentSignal(db, row.incident.id);
		if (!signal?.monitor.alertsEnabled) continue;
		tasks.push({
			kind: 'incident_followup',
			incidentId: row.incident.id,
			monitorId: signal.monitor.id,
			run: () => processFollowup(env, settings, row.incident),
		});
		if (tasks.length >= maxFollowups) break;
	}
	return tasks;
}

export async function runAutopilot(
	env: Env,
	input: { events?: AutopilotEvent[]; budget?: AiBudget; skipSweep?: boolean } = {},
): Promise<AutopilotSummary> {
	const summary: AutopilotSummary = { calls: 0, written: 0, rejected: 0, failed: 0, skipped: 0 };
	const db = getDb(env);
	const [settings] = await db.select().from(aiSettings).where(eq(aiSettings.id, 1)).limit(1);
	if (!settings?.enabled || !settings.autopilotEnabled || !settings.baseUrl || !settings.apiKey || !settings.model) return summary;
	const budget = input.budget ?? { remaining: resolveRunLimits(env).aiCallsPerRun, deadline: Date.now() + AUTOPILOT_DEADLINE_MS };
	budget.deadline ??= Date.now() + AUTOPILOT_DEADLINE_MS;
	const tasks: Task[] = [];
	const excluded = new Set<number>();
	for (const event of input.events ?? []) {
		if (!event.monitor.alertsEnabled) continue;
		if (event.transition === 'opened') {
			const incident = await findLatestAutoIncidentForMonitor(db, event.monitor.id, { resolved: false, kind: 'down' });
			if (incident) {
				excluded.add(incident.id);
				tasks.push({
					kind: 'incident_open',
					incidentId: incident.id,
					monitorId: event.monitor.id,
					run: () => processOpening(env, settings, event, incident.id, 'down'),
				});
			}
		}
		if (event.transition === 'resolved') {
			const incident = await findLatestAutoIncidentForMonitor(db, event.monitor.id, { resolved: true, kind: 'down' });
			if (incident) {
				tasks.push({
					kind: 'incident_resolve',
					incidentId: incident.id,
					monitorId: event.monitor.id,
					run: () => processResolution(env, settings, event, incident.id, RECOVERY_UPDATE_BODY),
				});
			}
		}
		if (event.latencyTransition === 'degraded' && settings.autopilotDegradedIncidents) {
			const incident = await findLatestAutoIncidentForMonitor(db, event.monitor.id, { resolved: false, kind: 'degraded' });
			if (incident) {
				excluded.add(incident.id);
				tasks.push({
					kind: 'degraded_open',
					incidentId: incident.id,
					monitorId: event.monitor.id,
					run: () => processOpening(env, settings, event, incident.id, 'degraded'),
				});
			}
		}
		if (event.transition !== 'opened' && event.latencyTransition === 'recovered' && settings.autopilotDegradedIncidents) {
			const incident = await findLatestAutoIncidentForMonitor(db, event.monitor.id, { resolved: true, kind: 'degraded' });
			if (incident) {
				tasks.push({
					kind: 'incident_resolve',
					incidentId: incident.id,
					monitorId: event.monitor.id,
					run: () => processResolution(env, settings, event, incident.id, DEGRADED_RECOVERY_UPDATE_BODY),
				});
			}
		}
	}
	if (!input.skipSweep) tasks.push(...(await loadFollowupTasks(env, settings, excluded)));
	const priority: Record<AiEventKind, number> = {
		incident_open: 0,
		incident_resolve: 1,
		degraded_open: 2,
		incident_followup: 3,
		manual_draft: 4,
		settings_test: 5,
	};
	tasks.sort((left, right) => priority[left.kind] - priority[right.kind]);

	for (let offset = 0; offset < tasks.length; offset += AUTOPILOT_CONCURRENCY) {
		const batch = tasks.slice(offset, offset + AUTOPILOT_CONCURRENCY);
		await Promise.all(
			batch.map(async (task) => {
				if (budget.remaining <= 0 || Date.now() >= budget.deadline!) {
					summary.skipped += 1;
					await recordAiEvent(env, {
						kind: task.kind,
						incidentId: task.incidentId,
						monitorId: task.monitorId,
						model: settings.model,
						outcome: 'skipped_budget',
						reason: budget.remaining <= 0 ? 'per_run_limit' : 'deadline',
					});
					return;
				}
				budget.remaining -= 1;
				summary.calls += 1;
				try {
					if (await task.run()) summary.written += 1;
				} catch (error) {
					summary.failed += 1;
					console.warn(
						JSON.stringify({
							message: 'autopilot task failed',
							kind: task.kind,
							incidentId: task.incidentId,
							error: error instanceof Error ? error.message : String(error),
						}),
					);
				}
			}),
		);
	}
	return summary;
}
