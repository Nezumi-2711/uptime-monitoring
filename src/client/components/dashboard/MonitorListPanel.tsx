import { useState } from 'react';
import { ArrowRight, Database, History, Pencil, Power, PowerOff, RefreshCw, Trash2 } from 'lucide-react';
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { Monitor } from '../../api/monitors';
import { navigate } from '../../lib/router';
import { useDeleteMonitorMutation, useMonitorsQuery, useRunCheckMutation, useUpdateMonitorMutation } from '../../queries/monitors';
import { SiteIcon } from '../SiteIcon';
import { DeleteMonitorDialog } from './DeleteMonitorDialog';

type MonitorListPanelProps = {
	formOpen: boolean;
	onAddMonitor: () => void;
	onEdit: (monitor: Monitor) => void;
};

function formatCheckedAt(value: string | null) {
	if (!value) return 'Not checked yet';
	return new Intl.DateTimeFormat('en', {
		dateStyle: 'medium',
		timeStyle: 'short',
	}).format(new Date(value));
}

function monitorStatus(monitor: Monitor): { label: string; className: BadgeVariant } {
	if (monitor.lastOk === true) return { label: 'Up', className: 'online' };
	if (monitor.lastOk === false) return { label: 'Down', className: 'offline' };
	return { label: 'Not checked', className: 'checking' };
}

function errorMessage(error: unknown, fallback: string) {
	return error instanceof Error ? error.message : fallback;
}

export function MonitorListPanel({ formOpen, onAddMonitor, onEdit }: MonitorListPanelProps) {
	const monitorsQuery = useMonitorsQuery();
	const updateMutation = useUpdateMonitorMutation();
	const deleteMutation = useDeleteMonitorMutation();
	const checkMutation = useRunCheckMutation();
	const [pendingDelete, setPendingDelete] = useState<Monitor | null>(null);
	const monitors = monitorsQuery.data?.monitors ?? [];

	function confirmDelete() {
		if (!pendingDelete) return;
		deleteMutation.mutate(pendingDelete.id, {
			onSuccess: () => setPendingDelete(null),
		});
	}

	return (
		<section className="services-panel" aria-labelledby="monitor-list-title">
			<DeleteMonitorDialog
				monitor={pendingDelete}
				isPending={deleteMutation.isPending}
				onCancel={() => setPendingDelete(null)}
				onConfirm={confirmDelete}
			/>
			<div className="panel-heading">
				<div>
					<h2 id="monitor-list-title">Configured sites</h2>
					<p>Latest result for each monitored endpoint.</p>
				</div>
				<Button
					variant="unstyled"
					className="icon-button"
					type="button"
					onClick={() => void monitorsQuery.refetch()}
					disabled={monitorsQuery.isFetching}
					aria-label="Refresh monitors"
				>
					<RefreshCw className={monitorsQuery.isFetching ? 'is-spinning' : ''} />
				</Button>
			</div>

			{monitorsQuery.isPending ? (
				<div className="monitor-skeleton" aria-label="Loading monitors">
					{[0, 1, 2].map((item) => (
						<div key={item}>
							<i />
							<span />
							<b />
						</div>
					))}
				</div>
			) : monitorsQuery.isError ? (
				<div className="panel-state error-state">
					<strong>Monitors could not be loaded</strong>
					<p>{errorMessage(monitorsQuery.error, 'Unknown request error')}</p>
					<Button variant="unstyled" className="secondary-button" type="button" onClick={() => void monitorsQuery.refetch()}>
						Try again
					</Button>
				</div>
			) : monitors.length === 0 ? (
				<div className="panel-state empty-state">
					<span className="empty-icon">
						<Database />
					</span>
					<strong>No monitors yet</strong>
					<p>Add the first endpoint to start collecting availability checks.</p>
					{!formOpen && (
						<Button variant="unstyled" className="primary-button" type="button" onClick={onAddMonitor}>
							Add first site <ArrowRight />
						</Button>
					)}
				</div>
			) : (
				<div className="monitor-list">
					<div className="services-title">
						<span>Monitor</span>
						<span>Latest result</span>
						<span>Actions</span>
					</div>
					{monitors.map((monitor) => {
						const status = monitorStatus(monitor);
						const checking = checkMutation.isPending && checkMutation.variables === monitor.id;
						const deleting = deleteMutation.isPending && deleteMutation.variables === monitor.id;
						const toggling = updateMutation.isPending && updateMutation.variables?.id === monitor.id;
						return (
							<article className={`service-row ${monitor.enabled ? '' : 'is-disabled'}`} key={monitor.id}>
								<div className="service-name">
									<span className="service-icon">
										<SiteIcon key={monitor.url} monitorId={monitor.id} />
									</span>
									<div>
										<Button
											variant="unstyled"
											className="monitor-name-link"
											type="button"
											onClick={() => navigate(`/monitors/${monitor.id}`)}
										>
											{monitor.name}
										</Button>
										<small title={monitor.url}>{monitor.url}</small>
										<span className="monitor-meta">
											{monitor.method} · expect {monitor.expectedStatus} · every {monitor.intervalSeconds / 60}m
										</span>
									</div>
								</div>
								<div className="monitor-result">
									<Badge variant={checking ? 'checking' : status.className}>{checking ? 'Checking' : status.label}</Badge>
									<code>
										{monitor.lastStatusCode === null ? '—' : `HTTP ${monitor.lastStatusCode}`} ·{' '}
										{monitor.lastLatencyMs === null ? '—' : `${monitor.lastLatencyMs} ms`}
									</code>
									<small title={monitor.lastError ?? undefined}>{monitor.lastError ?? formatCheckedAt(monitor.lastCheckedAt)}</small>
								</div>
								<div className="row-actions" aria-label={`Actions for ${monitor.name}`}>
									<Button
										variant="unstyled"
										className="row-action row-action-labeled"
										type="button"
										onClick={() => navigate(`/monitors/${monitor.id}`)}
									>
										<History aria-hidden="true" />
										<span>History</span>
									</Button>
									<Button
										variant="unstyled"
										className="row-action row-action-labeled row-action-accent"
										type="button"
										onClick={() => checkMutation.mutate(monitor.id)}
										disabled={checking}
										aria-busy={checking}
									>
										<RefreshCw className={checking ? 'is-spinning' : ''} aria-hidden="true" />
										<span>{checking ? 'Checking' : 'Check now'}</span>
									</Button>
									<Button
										variant="unstyled"
										className="row-action row-action-icon"
										type="button"
										onClick={() => onEdit(monitor)}
										aria-label={`Edit ${monitor.name}`}
										title="Edit monitor"
									>
										<Pencil aria-hidden="true" />
									</Button>
									<Button
										variant="unstyled"
										className="row-action row-action-icon"
										type="button"
										onClick={() => updateMutation.mutate({ id: monitor.id, input: { enabled: !monitor.enabled } })}
										disabled={toggling}
										aria-label={`${monitor.enabled ? 'Disable' : 'Enable'} ${monitor.name}`}
										title={`${monitor.enabled ? 'Disable' : 'Enable'} monitor`}
									>
										{monitor.enabled ? <PowerOff aria-hidden="true" /> : <Power aria-hidden="true" />}
									</Button>
									<Button
										variant="unstyled"
										className="row-action row-action-icon danger-action"
										type="button"
										onClick={() => setPendingDelete(monitor)}
										disabled={deleting}
										aria-label={`Delete ${monitor.name}`}
										title="Delete monitor"
										aria-busy={deleting}
									>
										<Trash2 aria-hidden="true" />
									</Button>
								</div>
							</article>
						);
					})}
				</div>
			)}
		</section>
	);
}
