import { type FormEvent, useState } from "react";
import {
	ArrowRight,
	Database,
	History,
	Pencil,
	Power,
	PowerOff,
	RefreshCw,
	Trash2,
	Zap,
} from "lucide-react";
import type { Monitor, MonitorInput, MonitorMethod } from "../api/monitors";
import { SiteIcon } from "../components/SiteIcon";
import { useLogoutMutation } from "../queries/auth";
import { navigate } from "../lib/router";
import {
	useCreateMonitorMutation,
	useDeleteMonitorMutation,
	useMonitorsQuery,
	useRunCheckMutation,
	useUpdateMonitorMutation,
} from "../queries/monitors";

const DEFAULT_INPUT: MonitorInput = {
	name: "",
	url: "https://",
	method: "GET",
	expectedStatus: 200,
	intervalSeconds: 300,
	timeoutMs: 10_000,
	enabled: true,
};

function formatCheckedAt(value: string | null) {
	if (!value) return "Not checked yet";
	return new Intl.DateTimeFormat("en", {
		dateStyle: "medium",
		timeStyle: "short",
	}).format(new Date(value));
}

function monitorStatus(monitor: Monitor) {
	if (monitor.lastOk === true) return { label: "Up", className: "online" };
	if (monitor.lastOk === false) return { label: "Down", className: "offline" };
	return { label: "Not checked", className: "checking" };
}

function errorMessage(error: unknown, fallback: string) {
	return error instanceof Error ? error.message : fallback;
}

export function DashboardPage() {
	const monitorsQuery = useMonitorsQuery();
	const createMutation = useCreateMonitorMutation();
	const updateMutation = useUpdateMonitorMutation();
	const deleteMutation = useDeleteMonitorMutation();
	const checkMutation = useRunCheckMutation();
	const logoutMutation = useLogoutMutation();
	const [formOpen, setFormOpen] = useState(false);
	const [editing, setEditing] = useState<Monitor | null>(null);
	const [form, setForm] = useState<MonitorInput>(DEFAULT_INPUT);

	const monitors = monitorsQuery.data?.monitors ?? [];
	const up = monitors.filter((monitor) => monitor.lastOk === true).length;
	const down = monitors.filter((monitor) => monitor.lastOk === false).length;
	const formMutation = editing ? updateMutation : createMutation;

	function openCreateForm() {
		setEditing(null);
		setForm(DEFAULT_INPUT);
		setFormOpen(true);
	}

	function openEditForm(monitor: Monitor) {
		setEditing(monitor);
		setForm({
			name: monitor.name,
			url: monitor.url,
			method: monitor.method,
			expectedStatus: monitor.expectedStatus,
			intervalSeconds: monitor.intervalSeconds,
			timeoutMs: monitor.timeoutMs,
			enabled: monitor.enabled,
			alertsEnabled: monitor.alertsEnabled,
		});
		setFormOpen(true);
	}

	function closeForm() {
		if (formMutation.isPending) return;
		setFormOpen(false);
		setEditing(null);
	}

	function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const onSuccess = () => closeForm();
		if (editing) {
			updateMutation.mutate({ id: editing.id, input: form }, { onSuccess });
		} else {
			createMutation.mutate(form, { onSuccess });
		}
	}

	function handleDelete(monitor: Monitor) {
		if (window.confirm(`Delete ${monitor.name} and its check history?`)) {
			deleteMutation.mutate(monitor.id);
		}
	}

	return (
		<div className="dashboard-shell">
			<header className="dashboard-header">
				<div className="dashboard-header-inner">
					<a className="brand" href="/dashboard" aria-label="Upwatch dashboard">
						<Zap className="brand-mark" fill="currentColor" />
						<span>upwatch</span>
					</a>
					<div className="nav-actions">
						<span className="header-context">Production monitors</span>
						<a className="nav-auth" href="/">View status page</a>
						<button className="nav-auth" type="button" onClick={() => navigate("/settings")}>Settings</button>
						<button className="nav-auth" type="button" onClick={() => logoutMutation.mutate()} disabled={logoutMutation.isPending}>
							{logoutMutation.isPending ? "Signing out…" : "Sign out"}
						</button>
					</div>
				</div>
			</header>

			<main className="dashboard-main">
				<section className="dashboard-intro">
					<div>
						<p className="overline">Infrastructure</p>
						<h1>Monitors</h1>
						<p>Track endpoint availability from Cloudflare's edge every five minutes.</p>
					</div>
					{formOpen ? (
						<button className="secondary-button" type="button" onClick={closeForm}>Close form</button>
					) : monitorsQuery.isSuccess && monitors.length > 0 ? (
						<button className="primary-button" type="button" onClick={openCreateForm}>
							Add monitor <ArrowRight />
						</button>
					) : null}
				</section>

				<section className="metric-grid" aria-label="Monitor summary">
					<div className="metric-card"><p>Total monitors</p><strong>{monitors.length}</strong><span>{monitors.filter((monitor) => monitor.enabled).length} enabled</span></div>
					<div className="metric-card"><p>Currently up</p><strong>{up}</strong><span>Latest checks succeeded</span></div>
					<div className="metric-card"><p>Currently down</p><strong>{down}</strong><span>Needs attention</span></div>
				</section>

				{formOpen && (
					<section className="monitor-form-panel" aria-labelledby="monitor-form-title">
						<div className="form-panel-heading">
							<div><p className="overline">Configuration</p><h2 id="monitor-form-title">{editing ? `Edit ${editing.name}` : "Add a monitor"}</h2></div>
							<p>Checks run on the configured schedule, with a minimum interval of five minutes.</p>
						</div>
						<form className="monitor-form" onSubmit={handleSubmit}>
							<label className="field field-name"><span>Name</span><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} maxLength={100} required /></label>
							<label className="field field-url"><span>URL</span><input type="url" value={form.url} onChange={(event) => setForm({ ...form, url: event.target.value })} placeholder="https://example.com/health" required /></label>
							<label className="field"><span>Method</span><select value={form.method} onChange={(event) => setForm({ ...form, method: event.target.value as MonitorMethod })}><option>GET</option><option>HEAD</option><option>POST</option></select></label>
							<label className="field"><span>Expected status</span><input type="number" min="100" max="599" value={form.expectedStatus} onChange={(event) => setForm({ ...form, expectedStatus: event.target.valueAsNumber })} required /></label>
							<label className="field"><span>Interval</span><select value={form.intervalSeconds} onChange={(event) => setForm({ ...form, intervalSeconds: Number(event.target.value) })}><option value="300">5 minutes</option><option value="900">15 minutes</option><option value="1800">30 minutes</option><option value="3600">1 hour</option><option value="86400">24 hours</option></select></label>
							<label className="field"><span>Timeout (ms)</span><input type="number" min="1000" max="30000" step="1000" value={form.timeoutMs} onChange={(event) => setForm({ ...form, timeoutMs: event.target.valueAsNumber })} required /></label>
							<label className="toggle-field"><input type="checkbox" checked={form.enabled ?? true} onChange={(event) => setForm({ ...form, enabled: event.target.checked })} /><span>Enable scheduled checks</span></label>
							<label className="toggle-field"><input type="checkbox" checked={form.alertsEnabled ?? true} onChange={(event) => setForm({ ...form, alertsEnabled: event.target.checked })} /><span>Enable incident alerts</span></label>
							<div className="form-actions compact-actions">
								<button className="secondary-button" type="button" onClick={closeForm}>Cancel</button>
								<button className="primary-button" type="submit" disabled={formMutation.isPending}>{formMutation.isPending ? "Saving…" : editing ? "Save changes" : "Add monitor"}</button>
							</div>
							{formMutation.isError && <p className="form-error" role="alert">{errorMessage(formMutation.error, "Unable to save monitor")}</p>}
						</form>
					</section>
				)}

				<section className="services-panel" aria-labelledby="monitor-list-title">
					<div className="panel-heading">
						<div><h2 id="monitor-list-title">Configured sites</h2><p>Latest result for each monitored endpoint.</p></div>
						<button className="icon-button" type="button" onClick={() => void monitorsQuery.refetch()} disabled={monitorsQuery.isFetching} aria-label="Refresh monitors">
							<RefreshCw className={monitorsQuery.isFetching ? "is-spinning" : ""} />
						</button>
					</div>

					{monitorsQuery.isPending ? (
						<div className="monitor-skeleton" aria-label="Loading monitors">{[0, 1, 2].map((item) => <div key={item}><i /><span /><b /></div>)}</div>
					) : monitorsQuery.isError ? (
						<div className="panel-state error-state"><strong>Monitors could not be loaded</strong><p>{errorMessage(monitorsQuery.error, "Unknown request error")}</p><button className="secondary-button" type="button" onClick={() => void monitorsQuery.refetch()}>Try again</button></div>
					) : monitors.length === 0 ? (
						<div className="panel-state empty-state"><span className="empty-icon"><Database /></span><strong>No monitors yet</strong><p>Add the first endpoint to start collecting availability checks.</p>{!formOpen && <button className="primary-button" type="button" onClick={openCreateForm}>Add first site <ArrowRight /></button>}</div>
					) : (
						<div className="monitor-list">
							<div className="services-title"><span>Monitor</span><span>Latest result</span><span>Actions</span></div>
							{monitors.map((monitor) => {
								const status = monitorStatus(monitor);
								const checking = checkMutation.isPending && checkMutation.variables === monitor.id;
								const deleting = deleteMutation.isPending && deleteMutation.variables === monitor.id;
								const toggling = updateMutation.isPending && updateMutation.variables?.id === monitor.id;
								return (
									<article className={`service-row ${monitor.enabled ? "" : "is-disabled"}`} key={monitor.id}>
										<div className="service-name"><span className="service-icon"><SiteIcon key={monitor.url} monitorId={monitor.id} /></span><div><button className="monitor-name-link" type="button" onClick={() => navigate(`/monitors/${monitor.id}`)}>{monitor.name}</button><small title={monitor.url}>{monitor.url}</small><span className="monitor-meta">{monitor.method} · expect {monitor.expectedStatus} · every {monitor.intervalSeconds / 60}m</span></div></div>
										<div className="monitor-result"><span className={`row-status ${checking ? "checking" : status.className}`}><i />{checking ? "Checking" : status.label}</span><code>{monitor.lastStatusCode === null ? "—" : `HTTP ${monitor.lastStatusCode}`} · {monitor.lastLatencyMs === null ? "—" : `${monitor.lastLatencyMs} ms`}</code><small title={monitor.lastError ?? undefined}>{monitor.lastError ?? formatCheckedAt(monitor.lastCheckedAt)}</small></div>
										<div className="row-actions" aria-label={`Actions for ${monitor.name}`}>
											<button className="row-action row-action-labeled" type="button" onClick={() => navigate(`/monitors/${monitor.id}`)}>
												<History aria-hidden="true" />
												<span>History</span>
											</button>
											<button className="row-action row-action-labeled row-action-accent" type="button" onClick={() => checkMutation.mutate(monitor.id)} disabled={checking} aria-busy={checking}>
												<RefreshCw className={checking ? "is-spinning" : ""} aria-hidden="true" />
												<span>{checking ? "Checking" : "Check now"}</span>
											</button>
											<button className="row-action row-action-icon" type="button" onClick={() => openEditForm(monitor)} aria-label={`Edit ${monitor.name}`} title="Edit monitor">
												<Pencil aria-hidden="true" />
											</button>
											<button className="row-action row-action-icon" type="button" onClick={() => updateMutation.mutate({ id: monitor.id, input: { enabled: !monitor.enabled } })} disabled={toggling} aria-label={`${monitor.enabled ? "Disable" : "Enable"} ${monitor.name}`} title={`${monitor.enabled ? "Disable" : "Enable"} monitor`}>
												{monitor.enabled ? <PowerOff aria-hidden="true" /> : <Power aria-hidden="true" />}
											</button>
											<button className="row-action row-action-icon danger-action" type="button" onClick={() => handleDelete(monitor)} disabled={deleting} aria-label={`Delete ${monitor.name}`} title="Delete monitor" aria-busy={deleting}>
												<Trash2 aria-hidden="true" />
											</button>
										</div>
									</article>
								);
							})}
						</div>
					)}
				</section>
			</main>
			<footer className="dashboard-page-footer"><span>Cloudflare Workers + D1</span><span>Automatic refresh every minute</span></footer>
		</div>
	);
}
