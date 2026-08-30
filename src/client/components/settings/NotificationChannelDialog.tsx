import { type FormEvent, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { DropdownMenu as DropdownMenuPrimitive } from 'radix-ui';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import type { ChannelType, NotificationChannel, NotificationChannelInput } from '../../api/channels';
import { useCreateNotificationChannelMutation, useUpdateNotificationChannelMutation } from '../../queries/channels';
import { useMonitorsQuery } from '../../queries/monitors';

type FormState = {
	name: string;
	type: ChannelType;
	url: string;
	botToken: string;
	chatId: string;
	enabled: boolean;
	notifyManual: boolean;
	monitorIds: number[];
};

function initialForm(editing: NotificationChannel | null): FormState {
	return {
		name: editing?.name ?? '',
		type: editing?.type ?? 'slack',
		url: '',
		botToken: '',
		chatId: editing?.config.chatId ?? '',
		enabled: editing?.enabled ?? true,
		notifyManual: editing?.notifyManual ?? true,
		monitorIds: editing?.monitorIds ?? [],
	};
}

export function NotificationChannelDialog({ editing, onClose }: { editing: NotificationChannel | null; onClose: () => void }) {
	const createMutation = useCreateNotificationChannelMutation();
	const updateMutation = useUpdateNotificationChannelMutation();
	const monitorsQuery = useMonitorsQuery();
	const [form, setForm] = useState(() => initialForm(editing));
	const mutation = editing ? updateMutation : createMutation;
	const monitors = monitorsQuery.data?.monitors ?? [];
	const selected = monitors.filter((monitor) => form.monitorIds.includes(monitor.id));

	function toggleMonitor(id: number, checked: boolean) {
		setForm((current) => ({
			...current,
			monitorIds: checked ? [...current.monitorIds, id] : current.monitorIds.filter((monitorId) => monitorId !== id),
		}));
	}

	function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const secretEntered = form.type === 'telegram' ? Boolean(form.botToken.trim()) : Boolean(form.url.trim());
		const config = form.type === 'telegram' ? { botToken: form.botToken.trim(), chatId: form.chatId.trim() } : { url: form.url.trim() };
		const input: NotificationChannelInput = {
			name: form.name.trim(),
			type: form.type,
			...(editing && editing.type === form.type && !secretEntered ? {} : { config }),
			enabled: form.enabled,
			notifyManual: form.notifyManual,
			monitorIds: form.monitorIds,
		};
		if (editing) updateMutation.mutate({ id: editing.id, input }, { onSuccess: onClose });
		else createMutation.mutate(input, { onSuccess: onClose });
	}

	return (
		<Dialog open onOpenChange={(open) => !open && !mutation.isPending && onClose()}>
			<DialogContent className="channel-dialog">
				<DialogHeader className="channel-dialog-header">
					<p className="overline">Alert destination</p>
					<DialogTitle>{editing ? `Edit ${editing.name}` : 'Add notification channel'}</DialogTitle>
					<DialogDescription>Send incident activity to a team tool or custom integration.</DialogDescription>
				</DialogHeader>
				<form className="channel-form" onSubmit={submit}>
					<label className="field" htmlFor="channel-name">
						<span>Name</span>
						<Input
							id="channel-name"
							value={form.name}
							onChange={(event) => setForm({ ...form, name: event.target.value })}
							maxLength={100}
							placeholder="Platform alerts"
							required
						/>
					</label>
					<div className="field">
						<span id="channel-type-label">Provider</span>
						<Select value={form.type} onValueChange={(type) => setForm({ ...form, type: type as ChannelType, url: '', botToken: '' })}>
							<SelectTrigger aria-labelledby="channel-type-label">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="slack">Slack</SelectItem>
								<SelectItem value="discord">Discord</SelectItem>
								<SelectItem value="telegram">Telegram</SelectItem>
								<SelectItem value="webhook">Raw webhook</SelectItem>
							</SelectContent>
						</Select>
					</div>
					{form.type === 'telegram' ? (
						<>
							<label className="field" htmlFor="channel-token">
								<span>Bot token</span>
								<Input
									id="channel-token"
									type="password"
									autoComplete="off"
									value={form.botToken}
									onChange={(event) => setForm({ ...form, botToken: event.target.value })}
									placeholder={editing?.config.botToken ?? '123456:ABC…'}
									required={!editing || editing.type !== form.type}
								/>
							</label>
							<label className="field" htmlFor="channel-chat-id">
								<span>Chat ID</span>
								<Input
									id="channel-chat-id"
									value={form.chatId}
									onChange={(event) => setForm({ ...form, chatId: event.target.value })}
									placeholder="-100123456789"
									required
								/>
							</label>
						</>
					) : (
						<label className="field channel-endpoint-field" htmlFor="channel-url">
							<span>{form.type === 'webhook' ? 'Webhook URL' : `${form.type === 'slack' ? 'Slack' : 'Discord'} webhook URL`}</span>
							<Input
								id="channel-url"
								type="url"
								value={form.url}
								onChange={(event) => setForm({ ...form, url: event.target.value })}
								placeholder={editing?.config.url ?? 'https://hooks.example.com/…'}
								required={!editing || editing.type !== form.type}
							/>
						</label>
					)}
					<fieldset className="maintenance-services channel-services">
						<legend>Services</legend>
						<DropdownMenuPrimitive.Root>
							<DropdownMenuPrimitive.Trigger asChild>
								<button className="maintenance-service-select" type="button">
									<span className={selected.length === 0 ? 'is-placeholder' : undefined}>
										{selected.length === 0
											? 'All services'
											: selected.length === 1
												? selected[0].name
												: `${selected[0].name} +${selected.length - 1} more`}
									</span>
									<span className="maintenance-service-select-meta">
										<small>{selected.length || 'Any'}</small>
										<ChevronDown />
									</span>
								</button>
							</DropdownMenuPrimitive.Trigger>
							<DropdownMenuPrimitive.Portal>
								<DropdownMenuPrimitive.Content className="maintenance-service-menu" sideOffset={5} align="start">
									{monitors.map((monitor) => (
										<DropdownMenuPrimitive.CheckboxItem
											key={monitor.id}
											className="maintenance-service-option"
											checked={form.monitorIds.includes(monitor.id)}
											onCheckedChange={(checked) => toggleMonitor(monitor.id, checked === true)}
											onSelect={(event) => event.preventDefault()}
										>
											<span className="maintenance-service-check">
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
						<small className="field-helper">Leave empty to notify for every service.</small>
					</fieldset>
					<div className="settings-toggle channel-toggle-option">
						<Switch id="channel-enabled" checked={form.enabled} onCheckedChange={(enabled) => setForm({ ...form, enabled })} />
						<label htmlFor="channel-enabled">
							<strong>Enable channel</strong>
							<small>Allow automated downtime and recovery alerts.</small>
						</label>
					</div>
					<div className="settings-toggle channel-toggle-option">
						<Switch
							id="channel-manual"
							checked={form.notifyManual}
							onCheckedChange={(notifyManual) => setForm({ ...form, notifyManual })}
						/>
						<label htmlFor="channel-manual">
							<strong>Manual incident updates</strong>
							<small>Notify this channel when an admin publishes or updates an incident.</small>
						</label>
					</div>
					{form.type === 'webhook' && (
						<div className="channel-payload-preview">
							<span>Raw payload</span>
							<pre>{`{ "event": "down", "monitor": { … }, "statusCode": 500, "error": "…", "at": "…" }`}</pre>
						</div>
					)}
					<div className="form-actions compact-actions channel-dialog-footer">
						<Button variant="unstyled" className="secondary-button" type="button" onClick={onClose}>
							Cancel
						</Button>
						<Button variant="unstyled" className="primary-button" type="submit" disabled={mutation.isPending}>
							{mutation.isPending ? 'Saving…' : editing ? 'Save changes' : 'Add channel'}
						</Button>
					</div>
					{mutation.isError && (
						<p className="form-error" role="alert">
							{mutation.error.message}
						</p>
					)}
				</form>
			</DialogContent>
		</Dialog>
	);
}
