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
	if (deliveriesQuery.isPending) return <div className="channel-history-state">Loading delivery history…</div>;
	if (deliveriesQuery.isError) return <div className="channel-history-state form-error">Unable to load delivery history.</div>;
	if (deliveriesQuery.data.deliveries.length === 0) return <div className="channel-history-state">No deliveries recorded yet.</div>;
	return (
		<div className="channel-history" aria-label={`${channel.name} delivery history`}>
			{deliveriesQuery.data.deliveries.map((delivery) => (
				<div className="channel-history-row" key={delivery.id}>
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
			<div className="channel-panel-header">
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
				<Empty className="channel-empty">
					<EmptyTitle>No notification channels</EmptyTitle>
					<EmptyDescription>Add Slack, Discord, Telegram, or a raw webhook destination.</EmptyDescription>
				</Empty>
			) : (
				<div className="channel-list">
					{channelsQuery.data.channels.map((channel) => (
						<article className="channel-row" key={channel.id}>
							<div className="channel-row-summary">
								<div className="channel-main">
									<div className="channel-title">
										<strong>{channel.name}</strong>
										<Badge variant="maintenance">{channel.type}</Badge>
										{!channel.enabled && <span className="maintenance-disabled">Disabled</span>}
									</div>
									<div className="channel-delivery">
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
									<div className="channel-services">
										{channel.monitorIds.length === 0 ? (
											<em>All services</em>
										) : (
											channel.monitorIds.map((id) => <span key={id}>{monitorNames.get(id) ?? `Service ${id}`}</span>)
										)}
									</div>
								</div>
								<div className="channel-actions">
									<Button
										variant="unstyled"
										className="secondary-button compact-button"
										type="button"
										disabled={testMutation.isPending}
										onClick={() => testMutation.mutate(channel.id)}
									>
										<Send /> Test
									</Button>
									<Button
										variant="unstyled"
										className="secondary-button compact-button"
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
										className="icon-button danger-icon-button"
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
			{testMutation.isError && <p className="form-error channel-feedback">{testMutation.error.message}</p>}
			{testMutation.isSuccess && <p className="settings-success channel-feedback">Test notification delivered.</p>}
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
