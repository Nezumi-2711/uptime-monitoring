import { useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyTitle } from '@/components/ui/empty';
import type { MaintenanceWindow } from '../../api/maintenance';
import { useDeleteMaintenanceWindowMutation, useMaintenanceWindowsQuery } from '../../queries/maintenance';
import { useMonitorsQuery } from '../../queries/monitors';
import { MaintenanceWindowDialog, minutesToTime } from './MaintenanceWindowDialog';

export function MaintenanceWindowsPanel() {
	const windowsQuery = useMaintenanceWindowsQuery();
	const monitorsQuery = useMonitorsQuery();
	const deleteMutation = useDeleteMaintenanceWindowMutation();
	const [dialog, setDialog] = useState<{ open: boolean; editing: MaintenanceWindow | null }>({ open: false, editing: null });
	const [deleting, setDeleting] = useState<MaintenanceWindow | null>(null);
	const monitorNames = new Map(monitorsQuery.data?.monitors.map((monitor) => [monitor.id, monitor.name]));

	function confirmDelete() {
		if (!deleting) return;
		deleteMutation.mutate(deleting.id, { onSuccess: () => setDeleting(null) });
	}

	return (
		<>
			<div className="maintenance-panel-header">
				<p>Define daily quiet periods for backups or planned service work.</p>
				<Button variant="unstyled" className="secondary-button" type="button" onClick={() => setDialog({ open: true, editing: null })}>
					<Plus /> Add window
				</Button>
			</div>
			{windowsQuery.isPending ? (
				<div className="table-empty">Loading maintenance windows…</div>
			) : windowsQuery.isError ? (
				<Empty variant="error" className="m-6">
					<EmptyTitle>Unable to load maintenance windows</EmptyTitle>
				</Empty>
			) : windowsQuery.data.windows.length === 0 ? (
				<Empty className="maintenance-empty">
					<EmptyTitle>No maintenance windows</EmptyTitle>
					<EmptyDescription>Add a recurring window to keep planned downtime out of alerts and uptime.</EmptyDescription>
				</Empty>
			) : (
				<div className="maintenance-window-list">
					{windowsQuery.data.windows.map((window) => (
						<article className="maintenance-window-row" key={window.id}>
							<div className="maintenance-window-main">
								<div className="maintenance-window-title">
									<strong>{window.name}</strong>
									{window.active && <Badge variant="maintenance">Active now</Badge>}
									{!window.enabled && <span className="maintenance-disabled">Disabled</span>}
								</div>
								<p>
									{minutesToTime(window.startMinute)}–{minutesToTime(window.startMinute + window.durationMinutes)}{' '}
									<span>Daily · {window.timezone}</span>
								</p>
								<div className="maintenance-window-services">
									{window.monitorIds.length ? (
										window.monitorIds.map((id) => <span key={id}>{monitorNames.get(id) ?? `Service ${id}`}</span>)
									) : (
										<em>No services assigned</em>
									)}
								</div>
							</div>
							<div className="maintenance-window-actions">
								<Button
									variant="unstyled"
									className="icon-button"
									type="button"
									aria-label={`Edit ${window.name}`}
									onClick={() => setDialog({ open: true, editing: window })}
								>
									<Pencil />
								</Button>
								<Button
									variant="unstyled"
									className="icon-button danger-icon-button"
									type="button"
									aria-label={`Delete ${window.name}`}
									onClick={() => setDeleting(window)}
								>
									<Trash2 />
								</Button>
							</div>
						</article>
					))}
				</div>
			)}

			{dialog.open && <MaintenanceWindowDialog editing={dialog.editing} onClose={() => setDialog({ open: false, editing: null })} />}
			<AlertDialog open={deleting !== null} onOpenChange={(open) => !open && !deleteMutation.isPending && setDeleting(null)}>
				<AlertDialogContent onEscapeKeyDown={(event) => deleteMutation.isPending && event.preventDefault()}>
					<AlertDialogHeader>
						<p className="overline">Confirm</p>
						<AlertDialogTitle>Delete {deleting?.name}?</AlertDialogTitle>
						<AlertDialogDescription>This removes the recurring schedule. Existing check history is unchanged.</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter className="form-actions compact-actions">
						<AlertDialogCancel>
							<Button variant="unstyled" className="secondary-button" type="button" disabled={deleteMutation.isPending}>
								Cancel
							</Button>
						</AlertDialogCancel>
						<AlertDialogAction>
							<Button
								variant="unstyled"
								className="danger-button"
								type="button"
								disabled={deleteMutation.isPending}
								onClick={(event) => {
									event.preventDefault();
									confirmDelete();
								}}
							>
								{deleteMutation.isPending ? 'Deleting…' : 'Delete'}
							</Button>
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
