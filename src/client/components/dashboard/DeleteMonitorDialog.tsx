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
import { Button } from '@/components/ui/button';
import type { Monitor } from '../../api/monitors';

type DeleteMonitorDialogProps = {
	monitor: Monitor | null;
	isPending: boolean;
	onCancel: () => void;
	onConfirm: () => void;
};

export function DeleteMonitorDialog({ monitor, isPending, onCancel, onConfirm }: DeleteMonitorDialogProps) {
	return (
		<AlertDialog
			open={monitor !== null}
			onOpenChange={(open) => {
				if (!open && !isPending) onCancel();
			}}
		>
			<AlertDialogContent
				onEscapeKeyDown={(event) => {
					if (isPending) event.preventDefault();
				}}
			>
				<AlertDialogHeader>
					<p className="overline">Confirm</p>
					<AlertDialogTitle>Delete {monitor?.name}?</AlertDialogTitle>
					<AlertDialogDescription>This permanently deletes the monitor and its check history.</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter className="form-actions compact-actions">
					<AlertDialogCancel>
						<Button variant="unstyled" className="secondary-button" type="button" disabled={isPending}>
							Cancel
						</Button>
					</AlertDialogCancel>
					<AlertDialogAction>
						<Button
							variant="unstyled"
							className="danger-button"
							type="button"
							onClick={(event) => {
								event.preventDefault();
								onConfirm();
							}}
							disabled={isPending}
						>
							{isPending ? 'Deleting…' : 'Delete'}
						</Button>
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
