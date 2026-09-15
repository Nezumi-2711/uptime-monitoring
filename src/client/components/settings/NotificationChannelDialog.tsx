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
			<DialogContent className="flex flex-col gap-0 w-[calc(100vw-20px)] sm:w-[min(var(--spacing-dialog-channel),calc(100vw-32px))] sm:max-w-dialog-channel max-h-[calc(100dvh-20px)] sm:max-h-[min(90dvh,760px)] overflow-hidden p-0 rounded-card sm:rounded-xl shadow-[0_24px_70px_rgb(22_62_45/0.15),0_4px_16px_rgb(0_0_0/0.07)] dark:border dark:border-white/10 dark:bg-night-card dark:shadow-[0_24px_64px_-12px_rgba(0,0,0,0.85),0_0_0_1px_rgba(255,255,255,0.06)] *:data-[slot=dialog-close]:top-4 sm:*:data-[slot=dialog-close]:top-4.75 *:data-[slot=dialog-close]:right-3.5 sm:*:data-[slot=dialog-close]:right-5">
				<DialogHeader className="relative shrink-0 gap-1.25 pt-5.25 pr-13.5 pb-4.5 pl-5 sm:pt-6 sm:pr-16 sm:pb-5 sm:pl-panel-x border-b border-border-dialog-header bg-linear-to-b from-white to-surface-dialog-header dark:border-b-white/8 dark:bg-night-subtle [&_.overline]:mb-1 **:data-[slot=dialog-title]:text-xl **:data-[slot=dialog-title]:leading-tight **:data-[slot=dialog-title]:tracking-dialog-title **:data-[slot=dialog-description]:text-caption **:data-[slot=dialog-description]:leading-normal">
					<p className="overline">Alert destination</p>
					<DialogTitle>{editing ? `Edit ${editing.name}` : 'Add notification channel'}</DialogTitle>
					<DialogDescription>Send incident activity to a team tool or custom integration.</DialogDescription>
				</DialogHeader>
				<form
					className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-4.25 min-h-0 m-0 pt-4.5 px-5 sm:pt-5 sm:px-panel-x pb-0 overflow-y-auto overscroll-contain dialog-scrollbar [&_.field]:gap-1.5 [&_.field]:min-w-0"
					onSubmit={submit}
				>
					<label className="field col-span-1" htmlFor="channel-name">
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
					<div className="field col-span-1">
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
							<label className="field col-span-1" htmlFor="channel-token">
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
							<label className="field col-span-1" htmlFor="channel-chat-id">
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
						<label className="field col-span-1 sm:col-span-2" htmlFor="channel-url">
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
					<fieldset className="col-span-1 sm:col-span-2 min-w-0 m-0 p-0 border-0 pt-4.5 border-t border-border-section dark:border-t-white/8">
						<legend className="block mb-1.75 text-caption font-medium text-ink-label dark:text-night-body">Services</legend>
						<DropdownMenuPrimitive.Root>
							<DropdownMenuPrimitive.Trigger asChild>
								<button
									className="group flex w-full min-h-10.5 items-center justify-between gap-4 px-3 py-2 rounded-sm border border-border-control bg-white text-body text-left text-ink shadow-[inset_0_1px_2px_rgb(0_0_0/0.025)] cursor-pointer transition-colors duration-120 hover:border-[#aaa] focus-visible:outline-none focus-visible:border-primary-deep focus-visible:shadow-[0_0_0_3px_rgb(36_180_126/0.14)] data-[state=open]:border-primary-deep data-[state=open]:shadow-[0_0_0_3px_rgb(36_180_126/0.14)] disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/12 dark:bg-night-input dark:text-neutral-100 dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)] dark:hover:border-white/22 dark:focus-visible:border-primary-deep dark:focus-visible:shadow-brand-dot-dark dark:data-[state=open]:border-primary-deep dark:data-[state=open]:shadow-brand-dot-dark"
									type="button"
								>
									<span className={selected.length === 0 ? 'text-faint dark:text-neutral-400' : undefined}>
										{selected.length === 0
											? 'All services'
											: selected.length === 1
												? selected[0].name
												: `${selected[0].name} +${selected.length - 1} more`}
									</span>
									<span className="flex items-center gap-2.25 text-faint dark:text-neutral-400 [&>small]:font-mono [&>small]:text-2xs/snug-sm [&>small]:font-medium [&>small]:whitespace-nowrap [&>svg]:size-4 [&>svg]:transition-transform [&>svg]:duration-120 group-data-[state=open]:rotate-180">
										<small>{selected.length || 'Any'}</small>
										<ChevronDown />
									</span>
								</button>
							</DropdownMenuPrimitive.Trigger>
							<DropdownMenuPrimitive.Portal>
								<DropdownMenuPrimitive.Content
									className="z-70 w-(--radix-dropdown-menu-trigger-width) max-h-[min(256px,var(--radix-dropdown-menu-content-available-height))] overflow-y-auto p-1 rounded-lg border border-hairline bg-white shadow-[0_8px_24px_rgb(0_0_0/0.08)] dark:border-white/12 dark:bg-night-card dark:shadow-[0_16px_40px_rgba(0,0,0,0.6)]"
									sideOffset={5}
									align="start"
								>
									{monitors.map((monitor) => (
										<DropdownMenuPrimitive.CheckboxItem
											key={monitor.id}
											className="relative flex items-center gap-2.5 min-h-9 px-2.25 py-1.75 rounded-md text-caption text-ink cursor-pointer outline-none select-none focus:bg-surface-highlight data-highlighted:bg-surface-highlight dark:text-night-body dark:focus:bg-white/6 dark:focus:text-white dark:data-highlighted:bg-white/6 dark:data-highlighted:text-white"
											checked={form.monitorIds.includes(monitor.id)}
											onCheckedChange={(checked) => toggleMonitor(monitor.id, checked === true)}
											onSelect={(event) => event.preventDefault()}
										>
											<span className="grid shrink-0 size-4.25 place-items-center rounded border border-border-control bg-white text-white dark:border-white/20 dark:bg-night-icon in-data-[state=checked]:border-primary-deep in-data-[state=checked]:bg-primary-deep [&>svg]:size-3 [&>svg]:stroke-[2.5]">
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
						<small className="block mt-1.5 text-footnote text-muted-text dark:text-gray-400">
							Leave empty to notify for every service.
						</small>
					</fieldset>
					<div className="col-span-1 flex items-start gap-2.75 min-w-0 p-3.5 rounded-lg border border-border-option bg-surface-option transition-colors duration-160 hover:border-border-option-hover hover:bg-surface-option-hover dark:border-white/8 dark:bg-night-subtle dark:hover:border-white/18 dark:hover:bg-night-option-hover **:[[role=switch]]:mt-px [&>label]:min-w-0 [&>label]:cursor-pointer [&_strong]:block [&_strong]:text-caption [&_strong]:font-medium dark:[&_strong]:text-gray-50 [&_small]:block [&_small]:mt-1 [&_small]:text-footnote [&_small]:leading-alert [&_small]:text-muted-text dark:[&_small]:text-gray-400">
						<Switch id="channel-enabled" checked={form.enabled} onCheckedChange={(enabled) => setForm({ ...form, enabled })} />
						<label htmlFor="channel-enabled">
							<strong>Enable channel</strong>
							<small>Allow automated downtime and recovery alerts.</small>
						</label>
					</div>
					<div className="col-span-1 flex items-start gap-2.75 min-w-0 p-3.5 rounded-lg border border-border-option bg-surface-option transition-colors duration-160 hover:border-border-option-hover hover:bg-surface-option-hover dark:border-white/8 dark:bg-night-subtle dark:hover:border-white/18 dark:hover:bg-night-option-hover **:[[role=switch]]:mt-px [&>label]:min-w-0 [&>label]:cursor-pointer [&_strong]:block [&_strong]:text-caption [&_strong]:font-medium dark:[&_strong]:text-gray-50 [&_small]:block [&_small]:mt-1 [&_small]:text-footnote [&_small]:leading-alert [&_small]:text-muted-text dark:[&_small]:text-gray-400">
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
						<div className="col-span-1 sm:col-span-2 p-3 rounded-md border border-border-card bg-surface-soft dark:border-white/8 dark:bg-night-subtle [&>span]:block [&>span]:mb-1.75 [&>span]:text-xs [&>span]:font-semibold dark:[&>span]:text-gray-50 [&>pre]:m-0 [&>pre]:overflow-x-auto [&>pre]:text-footnote [&>pre]:text-muted-text dark:[&>pre]:text-gray-400">
							<span>Raw payload</span>
							<pre>{`{ "event": "down", "monitor": { … }, "statusCode": 500, "error": "…", "at": "…" }`}</pre>
						</div>
					)}
					{mutation.isError && (
						<p className="col-span-1 sm:col-span-2 form-error" role="alert">
							{mutation.error.message}
						</p>
					)}
					<div className="col-span-1 sm:col-span-2 sticky bottom-0 z-2 flex justify-end gap-2.25 w-auto -mx-5 sm:-mx-panel-x mt-0.75 px-5 py-3.5 sm:px-panel-x sm:py-3.75 border-t border-border-dialog-footer bg-surface-dialog-footer/97 backdrop-blur-md dark:border-t-white/8 dark:bg-night-card/97 [&_button]:flex-1 sm:[&_button]:flex-initial [&_.primary-button]:min-h-9.5 [&_.primary-button]:px-3.75 [&_.primary-button]:py-1.75 [&_.secondary-button]:min-h-9.5 [&_.secondary-button]:px-3.75 [&_.secondary-button]:py-1.75">
						<Button variant="unstyled" className="secondary-button" type="button" onClick={onClose}>
							Cancel
						</Button>
						<Button variant="unstyled" className="primary-button" type="submit" disabled={mutation.isPending}>
							{mutation.isPending ? 'Saving…' : editing ? 'Save changes' : 'Add channel'}
						</Button>
					</div>
				</form>
			</DialogContent>
		</Dialog>
	);
}
