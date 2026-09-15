import { useState } from 'react';
import { History, Pencil, Plus, Send, Trash2 } from 'lucide-react';
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
import type { NotificationChannel } from '../../api/channels';
import {
	useDeleteNotificationChannelMutation,
	useNotificationDeliveriesQuery,
	useNotificationChannelsQuery,
	useTestNotificationChannelMutation,
} from '../../queries/channels';
import { useMonitorsQuery } from '../../queries/monitors';
import { NotificationChannelDialog } from './NotificationChannelDialog';

function DeliveryHistory({ channel }: { channel: NotificationChannel }) {
	const deliveriesQuery = useNotificationDeliveriesQuery(channel.id);
	if (deliveriesQuery.isPending)
		return <div className="w-full mt-4 text-xs text-muted-text dark:text-gray-400">Loading delivery history…</div>;
	if (deliveriesQuery.isError) return <div className="w-full mt-4 text-xs form-error">Unable to load delivery history.</div>;
	if (deliveriesQuery.data.deliveries.length === 0)
		return <div className="w-full mt-4 text-xs text-muted-text dark:text-gray-400">No deliveries recorded yet.</div>;
	return (
		<div
			className="grid content-start w-full max-h-history-max gap-px mt-4.5 rounded-md border border-border-panel bg-border-panel overflow-auto overscroll-contain table-scrollbar dark:border-white/8 dark:bg-white/6"
			aria-label={`${channel.name} delivery history`}
		>
			{deliveriesQuery.data.deliveries.map((delivery) => (
				<div
					className="grid grid-cols-[78px_minmax(100px,0.8fr)_minmax(145px,1fr)_minmax(120px,1fr)_auto] items-center gap-3 p-2.5 sm:px-3 text-footnote bg-white min-w-table-min dark:bg-night-panel dark:hover:bg-night-subtle [&>strong]:font-semibold [&>strong]:capitalize dark:[&>strong]:text-gray-50 [&>span]:text-muted-text dark:[&>span]:text-gray-400 [&>small]:text-muted-text dark:[&>small]:text-gray-400"
					key={delivery.id}
				>
					<Badge variant={delivery.ok ? 'online' : 'offline'}>{delivery.ok ? 'Delivered' : 'Failed'}</Badge>
					<strong>{delivery.event.replaceAll('_', ' ')}</strong>
					<span>{new Date(delivery.createdAt).toLocaleString()}</span>
					<span>{delivery.statusCode ? `HTTP ${delivery.statusCode}` : delivery.error}</span>
					<small>
						{delivery.attempts} attempt{delivery.attempts === 1 ? '' : 's'}
					</small>
				</div>
			))}
		</div>
	);
}

export function NotificationChannelsPanel() {
	const channelsQuery = useNotificationChannelsQuery();
	const monitorsQuery = useMonitorsQuery();
	const deleteMutation = useDeleteNotificationChannelMutation();
	const testMutation = useTestNotificationChannelMutation();
	const [dialog, setDialog] = useState<{ open: boolean; editing: NotificationChannel | null }>({ open: false, editing: null });
	const [deleting, setDeleting] = useState<NotificationChannel | null>(null);
	const [historyId, setHistoryId] = useState<number | null>(null);
	const monitorNames = new Map(monitorsQuery.data?.monitors.map((monitor) => [monitor.id, monitor.name]));

	return (
		<>
			<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5 px-5 sm:px-panel-x py-5 border-b border-border-row dark:border-b-white/7 [&>p]:m-0 [&>p]:text-caption [&>p]:text-muted-text dark:[&>p]:text-gray-400 [&_svg]:size-3.75">
				<p>Route automatic and manual incident activity to the right team.</p>
				<Button variant="unstyled" className="secondary-button" type="button" onClick={() => setDialog({ open: true, editing: null })}>
					<Plus /> Add channel
				</Button>
			</div>
			{channelsQuery.isPending ? (
				<div className="table-empty">Loading notification channels…</div>
			) : channelsQuery.isError ? (
				<Empty variant="error" className="m-6">
					<EmptyTitle>Unable to load notification channels</EmptyTitle>
				</Empty>
			) : channelsQuery.data.channels.length === 0 ? (
				<Empty className="py-11 px-6">
					<EmptyTitle>No notification channels</EmptyTitle>
					<EmptyDescription>Add Slack, Discord, Telegram, or a raw webhook destination.</EmptyDescription>
				</Empty>
			) : (
				<div className="channel-list">
					{channelsQuery.data.channels.map((channel) => (
						<article
							className="flex flex-col px-5 sm:px-panel-x py-5.25 border-t border-border-row first:border-t-0 dark:border-t-white/6"
							key={channel.id}
						>
							<div className="flex flex-col sm:flex-row w-full sm:items-center justify-between gap-6">
								<div className="min-w-0">
									<div className="flex items-center flex-wrap gap-2 [&>strong]:text-sm [&>strong]:font-semibold dark:[&>strong]:text-gray-50">
										<strong>{channel.name}</strong>
										<Badge variant="maintenance">{channel.type}</Badge>
										{!channel.enabled && <span className="text-footnote text-faint dark:text-gray-400">Disabled</span>}
									</div>
									<div className="flex items-center flex-wrap gap-2 my-2 text-footnote text-faint dark:text-gray-400">
										{channel.lastDelivery ? (
											<Badge variant={channel.lastDelivery.ok ? 'online' : 'offline'}>
												{channel.lastDelivery.ok ? 'Delivered' : 'Failed'}
											</Badge>
										) : (
											<Badge variant="pending">No deliveries</Badge>
										)}
										{channel.lastDelivery && (
											<span>
												{new Date(channel.lastDelivery.createdAt).toLocaleString()} · {channel.lastDelivery.event.replaceAll('_', ' ')}
											</span>
										)}
									</div>
									<div className="flex items-center flex-wrap gap-2 [&>span]:px-1.75 [&>span]:py-1 [&>span]:rounded-badge [&>span]:border [&>span]:border-border-subtle [&>span]:bg-surface-soft [&>span]:text-footnote [&>span]:text-muted-text dark:[&>span]:border-white/8 dark:[&>span]:bg-night-icon dark:[&>span]:text-gray-400 [&>em]:px-1.75 [&>em]:py-1 [&>em]:rounded-badge [&>em]:border [&>em]:border-border-subtle [&>em]:bg-surface-soft [&>em]:text-footnote [&>em]:not-italic [&>em]:text-muted-text dark:[&>em]:border-white/8 dark:[&>em]:bg-night-icon dark:[&>em]:text-gray-400">
										{channel.monitorIds.length === 0 ? (
											<em>All services</em>
										) : (
											channel.monitorIds.map((id) => <span key={id}>{monitorNames.get(id) ?? `Service ${id}`}</span>)
										)}
									</div>
								</div>
								<div className="flex items-center flex-wrap gap-2 shrink-0 self-stretch sm:self-auto [&_svg]:size-3.75">
									<Button
										variant="unstyled"
										className="secondary-button min-h-8.5 px-2.5 py-1.75"
										type="button"
										disabled={testMutation.isPending}
										onClick={() => testMutation.mutate(channel.id)}
									>
										<Send /> Test
									</Button>
									<Button
										variant="unstyled"
										className="secondary-button min-h-8.5 px-2.5 py-1.75"
										type="button"
										aria-expanded={historyId === channel.id}
										onClick={() => setHistoryId((current) => (current === channel.id ? null : channel.id))}
									>
										<History /> History
									</Button>
									<Button
										variant="unstyled"
										className="icon-button"
										type="button"
										aria-label={`Edit ${channel.name}`}
										onClick={() => setDialog({ open: true, editing: channel })}
									>
										<Pencil />
									</Button>
									<Button
										variant="unstyled"
										className="icon-button text-danger-icon dark:text-red-400 dark:hover:not(:disabled):border-red-500/35 dark:hover:not(:disabled):text-red-300 dark:hover:not(:disabled):bg-red-500/12"
										type="button"
										aria-label={`Delete ${channel.name}`}
										onClick={() => setDeleting(channel)}
									>
										<Trash2 />
									</Button>
								</div>
							</div>
							{historyId === channel.id && <DeliveryHistory channel={channel} />}
						</article>
					))}
				</div>
			)}
			{testMutation.isError && <p className="form-error mx-panel-x mb-5 dark:text-red-400">{testMutation.error.message}</p>}
			{testMutation.isSuccess && (
				<p className="-mt-2 px-3 py-2.5 rounded-md border border-success-banner-border bg-success-banner-bg text-xs text-success-banner-text dark:border-brand/30 dark:bg-brand/10 dark:text-brand-soft mx-panel-x mb-5">
					Test notification delivered.
				</p>
			)}
			{dialog.open && <NotificationChannelDialog editing={dialog.editing} onClose={() => setDialog({ open: false, editing: null })} />}
			<AlertDialog open={deleting !== null} onOpenChange={(open) => !open && !deleteMutation.isPending && setDeleting(null)}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<p className="overline">Confirm</p>
						<AlertDialogTitle>Delete {deleting?.name}?</AlertDialogTitle>
						<AlertDialogDescription>This removes its routing and delivery history. Incident history is unchanged.</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter className="form-actions compact-actions">
						<AlertDialogCancel>
							<Button variant="unstyled" className="secondary-button" type="button">
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
									if (deleting) deleteMutation.mutate(deleting.id, { onSuccess: () => setDeleting(null) });
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
