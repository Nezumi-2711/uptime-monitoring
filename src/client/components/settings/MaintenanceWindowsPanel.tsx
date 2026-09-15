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
			<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5 px-5 sm:px-panel-x py-5 border-b border-border-row dark:border-b-white/7 [&>p]:m-0 [&>p]:text-caption [&>p]:text-muted-text dark:[&>p]:text-gray-400 [&_svg]:size-3.75">
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
				<Empty className="py-11 px-6">
					<EmptyTitle>No maintenance windows</EmptyTitle>
					<EmptyDescription>Add a recurring window to keep planned downtime out of alerts and uptime.</EmptyDescription>
				</Empty>
			) : (
				<div className="maintenance-window-list">
					{windowsQuery.data.windows.map((window) => (
						<article
							className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 px-5 sm:px-panel-x py-5.25 border-t border-border-row first:border-t-0 dark:border-t-white/6"
							key={window.id}
						>
							<div className="min-w-0 [&>p]:my-2 [&>p]:font-mono [&>p]:text-xs/relaxed [&>p]:font-medium [&>p]:text-ink-body dark:[&>p]:text-gray-300 [&>p>span]:text-faint dark:[&>p>span]:text-gray-400">
								<div className="flex items-center gap-2.5 [&>strong]:text-sm [&>strong]:font-semibold dark:[&>strong]:text-gray-50">
									<strong>{window.name}</strong>
									{window.active && <Badge variant="maintenance">Active now</Badge>}
									{!window.enabled && <span className="text-footnote text-faint dark:text-gray-400">Disabled</span>}
								</div>
								<p>
									{minutesToTime(window.startMinute)}–{minutesToTime(window.startMinute + window.durationMinutes)}{' '}
									<span>Daily · {window.timezone}</span>
								</p>
								<div className="flex flex-wrap gap-1.5 [&>span]:px-1.75 [&>span]:py-1 [&>span]:rounded-badge [&>span]:border [&>span]:border-border-subtle [&>span]:bg-surface-soft [&>span]:text-footnote [&>span]:not-italic [&>span]:text-muted-text dark:[&>span]:border-white/8 dark:[&>span]:bg-night-icon dark:[&>span]:text-gray-400 [&>em]:text-footnote [&>em]:not-italic [&>em]:text-faint dark:[&>em]:text-gray-400">
									{window.monitorIds.length ? (
										window.monitorIds.map((id) => <span key={id}>{monitorNames.get(id) ?? `Service ${id}`}</span>)
									) : (
										<em>No services assigned</em>
									)}
								</div>
							</div>
							<div className="flex shrink-0 self-end sm:self-auto -mt-12 sm:mt-0 gap-1.5 [&_svg]:size-3.75">
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
									className="icon-button text-danger-icon dark:text-red-400 dark:hover:not(:disabled):border-red-500/35 dark:hover:not(:disabled):text-red-300 dark:hover:not(:disabled):bg-red-500/12"
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
