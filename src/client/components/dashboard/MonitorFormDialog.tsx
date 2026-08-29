import { type FormEvent, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import type { Monitor, MonitorInput, MonitorMethod } from '../../api/monitors';
import { useCreateMonitorMutation, useUpdateMonitorMutation } from '../../queries/monitors';

export const DEFAULT_MONITOR_INPUT: MonitorInput = {
	name: '',
	url: 'https://',
	method: 'GET',
	expectedStatus: 200,
	intervalSeconds: 300,
	timeoutMs: 10_000,
	enabled: true,
};

const INTERVAL_OPTIONS = [
	{ value: '300', label: '5 minutes' },
	{ value: '900', label: '15 minutes' },
	{ value: '1800', label: '30 minutes' },
	{ value: '3600', label: '1 hour' },
	{ value: '86400', label: '24 hours' },
];

type MonitorFormDialogProps = {
	editing: Monitor | null;
	onClose: () => void;
};

function errorMessage(error: unknown, fallback: string) {
	return error instanceof Error ? error.message : fallback;
}

function monitorInput(monitor: Monitor | null): MonitorInput {
	if (!monitor) return DEFAULT_MONITOR_INPUT;
	return {
		name: monitor.name,
		url: monitor.url,
		method: monitor.method,
		expectedStatus: monitor.expectedStatus,
		intervalSeconds: monitor.intervalSeconds,
		timeoutMs: monitor.timeoutMs,
		enabled: monitor.enabled,
		alertsEnabled: monitor.alertsEnabled,
	};
}

export function MonitorFormDialog({ editing, onClose }: MonitorFormDialogProps) {
	const createMutation = useCreateMonitorMutation();
	const updateMutation = useUpdateMonitorMutation();
	const [form, setForm] = useState<MonitorInput>(() => monitorInput(editing));
	const formMutation = editing ? updateMutation : createMutation;

	function closeForm() {
		if (formMutation.isPending) return;
		onClose();
	}

	function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (editing) {
			updateMutation.mutate({ id: editing.id, input: form }, { onSuccess: onClose });
		} else {
			createMutation.mutate(form, { onSuccess: onClose });
		}
	}

	return (
		<Dialog
			open
			onOpenChange={(nextOpen) => {
				if (!nextOpen) closeForm();
			}}
		>
			<DialogContent
				className="max-h-[85vh] w-[calc(100%-2rem)] overflow-y-auto sm:max-w-3xl"
				onEscapeKeyDown={(event) => {
					if (formMutation.isPending) event.preventDefault();
				}}
				onInteractOutside={(event) => {
					if (formMutation.isPending) event.preventDefault();
				}}
			>
				<DialogHeader>
					<p className="overline">Configuration</p>
					<DialogTitle>{editing ? `Edit ${editing.name}` : 'Add a monitor'}</DialogTitle>
					<DialogDescription>Checks run on the configured schedule, with a minimum interval of five minutes.</DialogDescription>
				</DialogHeader>
				<form className="monitor-form" onSubmit={handleSubmit}>
					<label className="field field-name" htmlFor="monitor-name">
						<span>Name</span>
						<Input
							id="monitor-name"
							value={form.name}
							onChange={(event) => setForm({ ...form, name: event.target.value })}
							maxLength={100}
							required
						/>
					</label>
					<label className="field field-url" htmlFor="monitor-url">
						<span>URL</span>
						<Input
							id="monitor-url"
							type="url"
							value={form.url}
							onChange={(event) => setForm({ ...form, url: event.target.value })}
							placeholder="https://example.com/health"
							required
						/>
					</label>
					<div className="field">
						<span id="monitor-method-label">Method</span>
						<Select value={form.method} onValueChange={(value) => setForm({ ...form, method: value as MonitorMethod })}>
							<SelectTrigger aria-labelledby="monitor-method-label">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{(['GET', 'HEAD', 'POST'] as const).map((method) => (
									<SelectItem key={method} value={method}>
										{method}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<label className="field" htmlFor="monitor-expected-status">
						<span>Expected status</span>
						<Input
							id="monitor-expected-status"
							type="number"
							min="100"
							max="599"
							value={form.expectedStatus}
							onChange={(event) => setForm({ ...form, expectedStatus: event.target.valueAsNumber })}
							required
						/>
					</label>
					<div className="field">
						<span id="monitor-interval-label">Interval</span>
						<Select value={String(form.intervalSeconds)} onValueChange={(value) => setForm({ ...form, intervalSeconds: Number(value) })}>
							<SelectTrigger aria-labelledby="monitor-interval-label">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{INTERVAL_OPTIONS.map((option) => (
									<SelectItem key={option.value} value={option.value}>
										{option.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<label className="field" htmlFor="monitor-timeout">
						<span>Timeout (ms)</span>
						<Input
							id="monitor-timeout"
							type="number"
							min="1000"
							max="30000"
							step="1000"
							value={form.timeoutMs}
							onChange={(event) => setForm({ ...form, timeoutMs: event.target.valueAsNumber })}
							required
						/>
					</label>
					<div className="toggle-field">
						<Switch id="monitor-enabled" checked={form.enabled ?? true} onCheckedChange={(enabled) => setForm({ ...form, enabled })} />
						<label htmlFor="monitor-enabled">Enable scheduled checks</label>
					</div>
					<div className="toggle-field">
						<Switch
							id="monitor-alerts-enabled"
							checked={form.alertsEnabled ?? true}
							onCheckedChange={(alertsEnabled) => setForm({ ...form, alertsEnabled })}
						/>
						<label htmlFor="monitor-alerts-enabled">Enable incident alerts</label>
					</div>
					<div className="form-actions compact-actions">
						<Button variant="unstyled" className="secondary-button" type="button" onClick={closeForm}>
							Cancel
						</Button>
						<Button variant="unstyled" className="primary-button" type="submit" disabled={formMutation.isPending}>
							{formMutation.isPending ? 'Saving…' : editing ? 'Save changes' : 'Add monitor'}
						</Button>
					</div>
					{formMutation.isError && (
						<p className="form-error" role="alert">
							{errorMessage(formMutation.error, 'Unable to save monitor')}
						</p>
					)}
				</form>
			</DialogContent>
		</Dialog>
	);
}
