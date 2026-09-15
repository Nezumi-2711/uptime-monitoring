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
				<form className="grid grid-cols-2 gap-x-4 gap-y-5 mt-3" onSubmit={submit}>
					<label className="field col-span-full" htmlFor="maintenance-name">
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
					<div className="field col-span-full">
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
					<fieldset className="col-span-full min-w-0 m-0 p-0 border-0 [&>legend]:mb-2 [&>legend]:text-caption [&>legend]:font-medium [&>legend]:text-ink-label dark:[&>legend]:text-night-body">
						<legend>Services</legend>
						<DropdownMenuPrimitive.Root>
							<DropdownMenuPrimitive.Trigger asChild>
								<button
									className="group flex w-full min-h-10.5 items-center justify-between gap-4 px-3 py-2 rounded-md border border-border-subtle bg-white text-sm text-left text-ink shadow-[inset_0_1px_2px_rgb(0_0_0/0.025)] cursor-pointer transition-[border-color,box-shadow] duration-120 hover:border-border-input-hover focus-visible:outline-none focus-visible:border-primary-deep focus-visible:shadow-[0_0_0_3px_rgb(36_180_126/0.14)] data-[state=open]:border-primary-deep data-[state=open]:shadow-[0_0_0_3px_rgb(36_180_126/0.14)] disabled:cursor-not-allowed disabled:opacity-55 dark:border-white/12 dark:bg-night-input dark:text-gray-50 dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)] dark:hover:border-white/22 dark:focus-visible:border-primary-deep dark:focus-visible:shadow-[0_0_0_3px_rgba(62,207,142,0.2)] dark:data-[state=open]:border-primary-deep dark:data-[state=open]:shadow-[0_0_0_3px_rgba(62,207,142,0.2)]"
									type="button"
									disabled={monitorsQuery.isPending || monitors.length === 0}
									aria-label="Select services for this maintenance window"
								>
									<span className={selectedMonitors.length === 0 ? 'text-faint' : undefined}>
										{monitorsQuery.isPending
											? 'Loading services…'
											: monitors.length === 0
												? 'No services available'
												: selectedServicesLabel}
									</span>
									<span className="flex items-center gap-2.25 text-faint [&>small]:font-mono [&>small]:text-2xs/[1.3] [&>small]:font-medium [&>small]:whitespace-nowrap [&>svg]:size-4 [&>svg]:transition-transform [&>svg]:duration-120 group-data-[state=open]:rotate-180">
										{selectedMonitors.length > 0 && <small>{selectedMonitors.length} selected</small>}
										<ChevronDown aria-hidden="true" />
									</span>
								</button>
							</DropdownMenuPrimitive.Trigger>
							<DropdownMenuPrimitive.Portal>
								<DropdownMenuPrimitive.Content
									className="z-70 w-(--radix-dropdown-menu-trigger-width) max-h-[min(256px,var(--radix-dropdown-menu-content-available-height))] overflow-y-auto p-1 rounded-lg border border-hairline bg-white shadow-[0_8px_24px_rgb(0_0_0/0.08)] dark:border-white/12 dark:bg-night-card dark:shadow-[0_16px_40px_rgba(0,0,0,0.6)]"
									sideOffset={5}
									align="start"
								>
									{monitors.map((monitor) => (
										<DropdownMenuPrimitive.CheckboxItem
											key={monitor.id}
											className="relative flex items-center gap-2.5 min-h-9 px-2.25 py-1.75 rounded-md text-caption text-ink cursor-pointer outline-none select-none focus:bg-surface-highlight data-highlighted:bg-surface-highlight dark:text-night-body dark:focus:bg-white/6 dark:focus:text-white dark:data-highlighted:bg-white/6 dark:data-highlighted:text-white"
											checked={form.monitorIds.includes(monitor.id)}
											onCheckedChange={(checked) => toggleMonitor(monitor.id, checked === true)}
											onSelect={(event) => event.preventDefault()}
										>
											<span
												className="grid shrink-0 size-4.25 place-items-center rounded border border-border-control bg-white text-white dark:border-white/20 dark:bg-night-icon in-data-[state=checked]:border-primary-deep in-data-[state=checked]:bg-primary-deep [&>svg]:size-3 [&>svg]:stroke-[2.5]"
												aria-hidden="true"
											>
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
							<small className="block mt-1.75 text-footnote text-muted-text dark:text-gray-400">
								Add a monitor before assigning a maintenance window.
							</small>
						)}
					</fieldset>
					<div className="col-span-full flex items-center gap-2.75 [&>label]:cursor-pointer [&_strong]:block [&_strong]:text-caption [&_strong]:font-medium dark:[&_strong]:text-gray-50 [&_small]:block [&_small]:mt-1 [&_small]:text-muted-text dark:[&_small]:text-gray-400">
						<Switch id="maintenance-enabled" checked={form.enabled} onCheckedChange={(enabled) => setForm({ ...form, enabled })} />
						<label htmlFor="maintenance-enabled">
							<strong>Enable this window</strong>
							<small>The schedule repeats every day in the selected timezone.</small>
						</label>
					</div>
					<p className="-mt-1.5 col-span-full text-xs leading-normal text-muted-text dark:text-gray-400">
						Checks run every five minutes. Add a few minutes of padding before and after the backup.
					</p>
					<div className="form-actions compact-actions col-span-full">
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
