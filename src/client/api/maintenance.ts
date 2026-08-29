import { deleteJson, getJson, patchJson, postJson } from './http';

export type MaintenanceWindow = {
	id: number;
	name: string;
	startMinute: number;
	durationMinutes: number;
	timezone: string;
	enabled: boolean;
	monitorIds: number[];
	active: boolean;
	createdAt: string;
	updatedAt: string;
};

export type MaintenanceWindowInput = {
	name: string;
	startMinute: number;
	durationMinutes: number;
	timezone: string;
	enabled: boolean;
	monitorIds: number[];
};

export function getMaintenanceWindows(signal?: AbortSignal) {
	return getJson<{ windows: MaintenanceWindow[] }>('/api/maintenance', { signal, credentials: 'same-origin' });
}

export function createMaintenanceWindow(input: MaintenanceWindowInput) {
	return postJson<{ window: MaintenanceWindow }>('/api/maintenance', input);
}

export function updateMaintenanceWindow(id: number, input: Partial<MaintenanceWindowInput>) {
	return patchJson<{ window: MaintenanceWindow }>(`/api/maintenance/${id}`, input);
}

export function deleteMaintenanceWindow(id: number) {
	return deleteJson<{ ok: true }>(`/api/maintenance/${id}`);
}
