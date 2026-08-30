import { deleteJson, getJson, patchJson, postJson } from './http';

export type IncidentStatus = 'investigating' | 'identified' | 'monitoring' | 'resolved';
export type IncidentImpact = 'none' | 'minor' | 'major' | 'critical';
export type IncidentSource = 'auto' | 'manual';

export type IncidentUpdate = {
	id: number;
	incidentId: number;
	status: IncidentStatus;
	body: string;
	note: string | null;
	source: 'manual' | 'ai' | 'system';
	createdAt: string;
};

export type Incident = {
	id: number;
	title: string | null;
	status: IncidentStatus;
	impact: IncidentImpact;
	source: IncidentSource;
	startedAt: string;
	resolvedAt: string | null;
	startStatusCode: number | null;
	startError: string | null;
	durationMs: number | null;
	createdAt: string;
	updatedAt: string;
	monitorIds: number[];
	updates?: IncidentUpdate[];
	updateCount?: number;
};

export type IncidentInput = {
	title: string;
	status: IncidentStatus;
	impact: IncidentImpact;
	body: string;
	note?: string | null;
	monitorIds: number[];
};
export type IncidentUpdateInput = { status: IncidentStatus; body: string; note?: string | null };

export function listIncidents(status: 'open' | 'all' = 'open', signal?: AbortSignal) {
	return getJson<{ incidents: Incident[] }>(`/api/incidents?status=${status}`, { signal, credentials: 'same-origin' });
}
export function getIncident(id: number, signal?: AbortSignal) {
	return getJson<{ incident: Incident }>(`/api/incidents/${id}`, { signal, credentials: 'same-origin' });
}
export function createIncident(input: IncidentInput) {
	return postJson<{ incident: Incident }>('/api/incidents', input);
}
export function updateIncident(id: number, input: Partial<Pick<IncidentInput, 'title' | 'impact' | 'monitorIds'>>) {
	return patchJson<{ incident: Incident }>(`/api/incidents/${id}`, input);
}
export function postIncidentUpdate(id: number, input: IncidentUpdateInput) {
	return postJson<{ incident: Incident }>(`/api/incidents/${id}/updates`, input);
}
export function deleteIncident(id: number) {
	return deleteJson<{ ok: true }>(`/api/incidents/${id}`);
}
export function draftIncident(input: { note: string; status: IncidentStatus; monitorIds: number[] }) {
	return postJson<{ title: string; body: string }>('/api/incidents/draft', input);
}
export function draftIncidentUpdate(id: number, input: { note: string; status: IncidentStatus }) {
	return postJson<{ body: string }>(`/api/incidents/${id}/updates/draft`, input);
}
