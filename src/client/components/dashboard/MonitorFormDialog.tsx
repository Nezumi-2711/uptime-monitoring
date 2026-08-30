import { type FormEvent, useState } from 'react';
import { ChevronDown, Plus, Trash2 } from 'lucide-react';
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
	retryCount: 1,
	failureThreshold: 2,
	expectKeyword: null,
	keywordInverted: false,
	requestHeaders: null,
	requestBody: null,
	degradedLatencyMs: null,
	enabled: true,
	alertsEnabled: true,
};

export const INTERVAL_OPTIONS = [
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

type HeaderRow = { id: number; name: string; value: string };

function headerRows(requestHeaders: string | null): HeaderRow[] {
	if (!requestHeaders) return [];
	try {
		return Object.entries(JSON.parse(requestHeaders) as Record<string, string>).map(([name, value], index) => ({ id: index, name, value }));
	} catch {
		return [];
	}
}

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
		retryCount: monitor.retryCount,
		failureThreshold: monitor.failureThreshold,
		expectKeyword: monitor.expectKeyword,
		keywordInverted: monitor.keywordInverted,
		requestHeaders: monitor.requestHeaders ? (JSON.parse(monitor.requestHeaders) as Record<string, string>) : null,
		requestBody: monitor.requestBody,
		degradedLatencyMs: monitor.degradedLatencyMs,
		enabled: monitor.enabled,
		alertsEnabled: monitor.alertsEnabled,
	};
}

export function MonitorFormDialog({ editing, onClose }: MonitorFormDialogProps) {
	const createMutation = useCreateMonitorMutation();
	const updateMutation = useUpdateMonitorMutation();
	const [form, setForm] = useState<MonitorInput>(() => monitorInput(editing));
	const [headers, setHeaders] = useState<HeaderRow[]>(() => headerRows(editing?.requestHeaders ?? null));
	const [nextHeaderId, setNextHeaderId] = useState(() => headers.length);
	const formMutation = editing ? updateMutation : createMutation;

	function closeForm() {
		if (formMutation.isPending) return;
		onClose();
	}

	function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const requestHeaders = Object.fromEntries(
			headers.filter((header) => header.name.trim()).map((header) => [header.name.trim(), header.value]),
		);
		const input: MonitorInput = {
			...form,
			expectKeyword: form.expectKeyword?.trim() || null,
			requestHeaders: Object.keys(requestHeaders).length > 0 ? requestHeaders : null,
			requestBody: form.method === 'POST' ? form.requestBody || null : null,
		};
		if (editing) {
			updateMutation.mutate({ id: editing.id, input }, { onSuccess: onClose });
		} else {
			createMutation.mutate(input, { onSuccess: onClose });
		}
	}

	function addHeader() {
		setHeaders((current) => [...current, { id: nextHeaderId, name: '', value: '' }]);
		setNextHeaderId((current) => current + 1);
	}

	function updateHeader(id: number, field: 'name' | 'value', value: string) {
		setHeaders((current) => current.map((header) => (header.id === id ? { ...header, [field]: value } : header)));
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
					<DialogDescription>
						Checks run at least every five minutes. Failures are retried immediately and must repeat before an incident is published.
					</DialogDescription>
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
					<div className="field">
						<span id="monitor-retries-label">Retries after a failure</span>
						<Select value={String(form.retryCount ?? 1)} onValueChange={(value) => setForm({ ...form, retryCount: Number(value) })}>
							<SelectTrigger aria-labelledby="monitor-retries-label">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="0">No retry</SelectItem>
								{[1, 2, 3].map((count) => (
									<SelectItem key={count} value={String(count)}>{`${count} ${count === 1 ? 'retry' : 'retries'}`}</SelectItem>
								))}
							</SelectContent>
						</Select>
						<small>Retried immediately, so a sub-second blip never reaches the status page.</small>
					</div>
					<div className="field">
						<span id="monitor-threshold-label">Confirmations before alerting</span>
						<Select
							value={String(form.failureThreshold ?? 2)}
							onValueChange={(value) => setForm({ ...form, failureThreshold: Number(value) })}
						>
							<SelectTrigger aria-labelledby="monitor-threshold-label">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="1">1 — alert immediately</SelectItem>
								{Array.from({ length: 9 }, (_, index) => index + 2).map((count) => (
									<SelectItem key={count} value={String(count)}>{`${count} consecutive failed checks`}</SelectItem>
								))}
							</SelectContent>
						</Select>
						<small>Confirmed after about {Math.round(((form.failureThreshold ?? 2) * form.intervalSeconds) / 60)} minutes.</small>
					</div>
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
					<details className="monitor-advanced">
						<summary>
							<span>Advanced request and response checks</span>
							<ChevronDown aria-hidden="true" />
						</summary>
						<div className="monitor-advanced-grid">
							<label className="field advanced-keyword" htmlFor="monitor-keyword">
								<span>Expected response keyword</span>
								<Input
									id="monitor-keyword"
									value={form.expectKeyword ?? ''}
									onChange={(event) => setForm({ ...form, expectKeyword: event.target.value || null })}
									maxLength={200}
									placeholder="healthy"
								/>
								<small>Case-insensitive match within the first 256 KB of the response.</small>
							</label>
							<div className="toggle-field advanced-inverted">
								<Switch
									id="monitor-keyword-inverted"
									checked={form.keywordInverted ?? false}
									onCheckedChange={(keywordInverted) => setForm({ ...form, keywordInverted })}
									disabled={!form.expectKeyword}
								/>
								<label htmlFor="monitor-keyword-inverted">Fail when present</label>
							</div>
							<label className="field advanced-latency" htmlFor="monitor-degraded-latency">
								<span>Degraded above (ms)</span>
								<Input
									id="monitor-degraded-latency"
									type="number"
									min="1"
									max="30000"
									value={form.degradedLatencyMs ?? ''}
									onChange={(event) => setForm({ ...form, degradedLatencyMs: event.target.value ? event.target.valueAsNumber : null })}
									placeholder="1500"
								/>
								<small>Publishes degraded performance after the configured confirmation count.</small>
							</label>
							<div className="advanced-headers">
								<div className="advanced-section-heading">
									<div>
										<span>Request headers</span>
										<small>Up to 10 headers. Restricted transport headers are blocked.</small>
									</div>
									<Button
										variant="unstyled"
										className="secondary-button header-add-button"
										type="button"
										onClick={addHeader}
										disabled={headers.length >= 10}
									>
										<Plus aria-hidden="true" /> Add header
									</Button>
								</div>
								{headers.length > 0 && (
									<div className="header-rows">
										{headers.map((header) => (
											<div className="header-row" key={header.id}>
												<Input
													aria-label="Header name"
													value={header.name}
													onChange={(event) => updateHeader(header.id, 'name', event.target.value)}
													maxLength={64}
													placeholder="Authorization"
												/>
												<Input
													aria-label="Header value"
													value={header.value}
													onChange={(event) => updateHeader(header.id, 'value', event.target.value)}
													maxLength={512}
													placeholder="Bearer …"
												/>
												<Button
													variant="unstyled"
													className="icon-button header-remove-button"
													type="button"
													aria-label={`Remove ${header.name || 'header'}`}
													onClick={() => setHeaders((current) => current.filter((item) => item.id !== header.id))}
												>
													<Trash2 aria-hidden="true" />
												</Button>
											</div>
										))}
									</div>
								)}
							</div>
							{form.method === 'POST' && (
								<label className="field advanced-body" htmlFor="monitor-request-body">
									<span>Request body</span>
									<textarea
										id="monitor-request-body"
										value={form.requestBody ?? ''}
										onChange={(event) => setForm({ ...form, requestBody: event.target.value || null })}
										maxLength={8192}
										rows={6}
										placeholder={'{"query":"health"}'}
									/>
									<small>Sent with POST requests. JSON content type is added unless overridden above.</small>
								</label>
							)}
						</div>
					</details>
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
