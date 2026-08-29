import { type FormEvent, useMemo, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { DropdownMenu as DropdownMenuPrimitive } from 'radix-ui';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import type { MaintenanceWindow, MaintenanceWindowInput } from '../../api/maintenance';
import { useCreateMaintenanceWindowMutation, useUpdateMaintenanceWindowMutation } from '../../queries/maintenance';
import { useMonitorsQuery } from '../../queries/monitors';

export function minutesToTime(minutes: number) {
	const normalized = ((minutes % 1440) + 1440) % 1440;
	return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
}

export function timeToMinutes(value: string) {
	const [hour, minute] = value.split(':').map(Number);
	return hour * 60 + minute;
}

function detectedTimezone() {
	return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

function timezoneOptions() {
	const intl = Intl as typeof Intl & { supportedValuesOf?: (key: 'timeZone') => string[] };
	if (intl.supportedValuesOf) return [...new Set(['UTC', detectedTimezone(), ...intl.supportedValuesOf('timeZone')])];
	return [...new Set(['UTC', detectedTimezone()])];
}

type FormState = {
	name: string;
	start: string;
	end: string;
	timezone: string;
	enabled: boolean;
	monitorIds: number[];
};

function initialForm(editing: MaintenanceWindow | null): FormState {
	if (!editing) {
		return { name: '', start: '02:00', end: '03:00', timezone: detectedTimezone(), enabled: true, monitorIds: [] };
	}
	return {
		name: editing.name,
		start: minutesToTime(editing.startMinute),
		end: minutesToTime(editing.startMinute + editing.durationMinutes),
		timezone: editing.timezone,
		enabled: editing.enabled,
		monitorIds: editing.monitorIds,
	};
}

export function MaintenanceWindowDialog({ editing, onClose }: { editing: MaintenanceWindow | null; onClose: () => void }) {
	const createMutation = useCreateMaintenanceWindowMutation();
	const updateMutation = useUpdateMaintenanceWindowMutation();
	const monitorsQuery = useMonitorsQuery();
	const [form, setForm] = useState(() => initialForm(editing));
	const [validationError, setValidationError] = useState<string | null>(null);
	const timezones = useMemo(() => timezoneOptions(), []);
	const mutation = editing ? updateMutation : createMutation;

	function close() {
		if (!mutation.isPending) onClose();
	}

	function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const startMinute = timeToMinutes(form.start);
		const durationMinutes = (timeToMinutes(form.end) - startMinute + 1440) % 1440;
		if (durationMinutes === 0) {
			setValidationError('Start and end time must differ');
			return;
		}
		setValidationError(null);
		const input: MaintenanceWindowInput = {
			name: form.name,
			startMinute,
			durationMinutes,
			timezone: form.timezone,
			enabled: form.enabled,
			monitorIds: form.monitorIds,
		};
		if (editing) updateMutation.mutate({ id: editing.id, input }, { onSuccess: onClose });
		else createMutation.mutate(input, { onSuccess: onClose });
	}

	function toggleMonitor(id: number, checked: boolean) {
		setForm((current) => ({
			...current,
			monitorIds: checked ? [...current.monitorIds, id] : current.monitorIds.filter((monitorId) => monitorId !== id),
		}));
	}

	const monitors = monitorsQuery.data?.monitors ?? [];
	const selectedMonitors = monitors.filter((monitor) => form.monitorIds.includes(monitor.id));
	const selectedServicesLabel =
		selectedMonitors.length === 0
			? 'Select services'
			: selectedMonitors.length === 1
				? selectedMonitors[0].name
				: `${selectedMonitors[0].name} +${selectedMonitors.length - 1} more`;

	return (
		<Dialog open onOpenChange={(open) => !open && close()}>
			<DialogContent
				className="max-h-[90vh] w-[calc(100%-2rem)] overflow-y-auto sm:max-w-2xl"
				onEscapeKeyDown={(event) => mutation.isPending && event.preventDefault()}
				onInteractOutside={(event) => mutation.isPending && event.preventDefault()}
			>
				<DialogHeader>
					<p className="overline">Daily schedule</p>
					<DialogTitle>{editing ? `Edit ${editing.name}` : 'Add maintenance window'}</DialogTitle>
					<DialogDescription>Probes continue, but alerts and uptime calculations pause for selected services.</DialogDescription>
				</DialogHeader>
				<form className="maintenance-form" onSubmit={submit}>
					<label className="field maintenance-name" htmlFor="maintenance-name">
						<span>Name</span>
						<Input
							id="maintenance-name"
							value={form.name}
							onChange={(event) => setForm({ ...form, name: event.target.value })}
							maxLength={100}
							placeholder="Nightly database backup"
							required
						/>
					</label>
					<label className="field" htmlFor="maintenance-start">
						<span>Start</span>
						<Input
							id="maintenance-start"
							type="time"
							value={form.start}
							onChange={(event) => setForm({ ...form, start: event.target.value })}
							required
						/>
					</label>
					<label className="field" htmlFor="maintenance-end">
						<span>End</span>
						<Input
							id="maintenance-end"
							type="time"
							value={form.end}
							onChange={(event) => setForm({ ...form, end: event.target.value })}
							required
						/>
					</label>
					<div className="field maintenance-timezone">
						<span id="maintenance-timezone-label">Timezone</span>
						<Select value={form.timezone} onValueChange={(timezone) => setForm({ ...form, timezone })}>
							<SelectTrigger aria-labelledby="maintenance-timezone-label">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{timezones.map((timezone) => (
									<SelectItem key={timezone} value={timezone}>
										{timezone}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<fieldset className="maintenance-services">
						<legend>Services</legend>
						<DropdownMenuPrimitive.Root>
							<DropdownMenuPrimitive.Trigger asChild>
								<button
									className="maintenance-service-select"
									type="button"
									disabled={monitorsQuery.isPending || monitors.length === 0}
									aria-label="Select services for this maintenance window"
								>
									<span className={selectedMonitors.length === 0 ? 'is-placeholder' : undefined}>
										{monitorsQuery.isPending
											? 'Loading services…'
											: monitors.length === 0
												? 'No services available'
												: selectedServicesLabel}
									</span>
									<span className="maintenance-service-select-meta">
										{selectedMonitors.length > 0 && <small>{selectedMonitors.length} selected</small>}
										<ChevronDown aria-hidden="true" />
									</span>
								</button>
							</DropdownMenuPrimitive.Trigger>
							<DropdownMenuPrimitive.Portal>
								<DropdownMenuPrimitive.Content className="maintenance-service-menu" sideOffset={5} align="start">
									{monitors.map((monitor) => (
										<DropdownMenuPrimitive.CheckboxItem
											key={monitor.id}
											className="maintenance-service-option"
											checked={form.monitorIds.includes(monitor.id)}
											onCheckedChange={(checked) => toggleMonitor(monitor.id, checked === true)}
											onSelect={(event) => event.preventDefault()}
										>
											<span className="maintenance-service-check" aria-hidden="true">
												<DropdownMenuPrimitive.ItemIndicator>
													<Check />
												</DropdownMenuPrimitive.ItemIndicator>
											</span>
											<span>{monitor.name}</span>
										</DropdownMenuPrimitive.CheckboxItem>
									))}
								</DropdownMenuPrimitive.Content>
							</DropdownMenuPrimitive.Portal>
						</DropdownMenuPrimitive.Root>
						{monitors.length === 0 && !monitorsQuery.isPending && (
							<small className="maintenance-services-empty">Add a monitor before assigning a maintenance window.</small>
						)}
					</fieldset>
					<div className="settings-toggle maintenance-enabled">
						<Switch id="maintenance-enabled" checked={form.enabled} onCheckedChange={(enabled) => setForm({ ...form, enabled })} />
						<label htmlFor="maintenance-enabled">
							<strong>Enable this window</strong>
							<small>The schedule repeats every day in the selected timezone.</small>
						</label>
					</div>
					<p className="maintenance-helper">Checks run every five minutes. Add a few minutes of padding before and after the backup.</p>
					<div className="form-actions compact-actions maintenance-actions">
						<Button variant="unstyled" className="secondary-button" type="button" onClick={close}>
							Cancel
						</Button>
						<Button variant="unstyled" className="primary-button" type="submit" disabled={mutation.isPending || monitorsQuery.isError}>
							{mutation.isPending ? 'Saving…' : editing ? 'Save changes' : 'Add window'}
						</Button>
					</div>
					{(validationError || mutation.isError) && (
						<p className="form-error" role="alert">
							{validationError ?? mutation.error?.message ?? 'Unable to save maintenance window'}
						</p>
					)}
				</form>
			</DialogContent>
		</Dialog>
	);
}
