import { type FormEvent, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Incident, IncidentStatus } from '../../api/incidents';
import { useDraftIncidentUpdateMutation, usePostIncidentUpdateMutation } from '../../queries/incidents';
import { AiComposeField } from './AiComposeField';
import { INCIDENT_STATUSES, IncidentStatusOption } from './IncidentSelectOption';

export function IncidentUpdateDialog({ incident, onClose }: { incident: Incident; onClose(): void }) {
	const post = usePostIncidentUpdateMutation();
	const draft = useDraftIncidentUpdateMutation(incident.id);
	const [status, setStatus] = useState<IncidentStatus>(incident.status);
	const [note, setNote] = useState('');
	const [body, setBody] = useState('');
	const [generated, setGenerated] = useState(false);
	function submit(event: FormEvent) {
		event.preventDefault();
		post.mutate({ id: incident.id, input: { status, body, note: note || null } }, { onSuccess: onClose });
	}
	return (
		<Dialog open onOpenChange={(open) => !open && !post.isPending && onClose()}>
			<DialogContent className="flex max-h-[min(90dvh,820px)] w-[min(var(--spacing-dialog-max),calc(100%-32px))] max-w-dialog-max flex-col gap-0 overflow-hidden rounded-dialog p-0 max-sm:max-h-[calc(100dvh-24px)] max-sm:w-[calc(100%-24px)] max-sm:rounded-xl max-compact:bottom-0 max-compact:top-auto max-compact:max-h-[calc(100dvh-8px)] max-compact:w-full max-compact:max-w-none max-compact:translate-y-0 max-compact:rounded-b-none max-compact:rounded-t-2xl dark:border-white/10 dark:bg-night-card dark:shadow-[0_24px_64px_-12px_rgba(0,0,0,0.85),0_0_0_1px_rgba(255,255,255,0.06)]">
				<DialogHeader className="gap-1.25 border-b border-border bg-linear-to-b from-white to-surface-hover p-6 pb-5 pl-7 pr-16 max-sm:py-4.5 max-sm:pl-5 max-sm:pr-14.5 max-compact:pb-4.25 max-compact:pl-4.5 max-compact:pr-13 max-compact:pt-5 dark:border-white/8 dark:bg-linear-to-b dark:from-night-card dark:to-[#101318]">
					<p className="overline mb-0.75 text-brand-deep dark:text-emerald-400">Incident update</p>
					<DialogTitle className="text-dialog-title leading-tight tracking-tight max-compact:text-brand-title">
						{incident.title ?? 'Service disruption'}
					</DialogTitle>
					<DialogDescription>Publish the next update and advance the incident lifecycle.</DialogDescription>
				</DialogHeader>
				<form className="flex min-h-0 flex-1 flex-col overflow-hidden" onSubmit={submit}>
					<div className="grid min-h-0 flex-1 gap-5.5 overflow-y-auto overscroll-contain p-6 px-7 pb-7 scrollbar-gutter-stable max-sm:gap-5 max-sm:p-5 max-compact:gap-4.5 max-compact:p-4.5">
						<div className="field w-full max-w-select-max **:data-[slot=select-trigger]:w-full">
							<span id="update-status-label">Status</span>
							<Select value={status} onValueChange={(value) => setStatus(value as IncidentStatus)}>
								<SelectTrigger aria-labelledby="update-status-label">
									<SelectValue>
										<IncidentStatusOption value={status} />
									</SelectValue>
								</SelectTrigger>
								<SelectContent>
									{INCIDENT_STATUSES.map((value) => (
										<SelectItem key={value} value={value}>
											<IncidentStatusOption value={value} />
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<AiComposeField
							note={note}
							body={body}
							onNoteChange={setNote}
							onBodyChange={setBody}
							onGenerate={() =>
								draft.mutate(
									{ note, status },
									{
										onSuccess: (result) => {
											setBody(result.body);
											setGenerated(true);
										},
									},
								)
							}
							isPending={draft.isPending}
							error={draft.error}
							generated={generated}
						/>
						{post.isError && (
							<p className="form-error" role="alert">
								{post.error.message}
							</p>
						)}
					</div>
					<div className="flex shrink-0 items-center justify-end gap-2.5 border-t border-border bg-surface-soft p-4 px-7 max-sm:px-5 max-compact:gap-2 max-compact:px-4.5 max-compact:pb-[max(12px,env(safe-area-inset-bottom))] max-compact:[&_button]:flex-1 max-compact:[&_button]:px-3 dark:border-white/8 dark:bg-night-dialog">
						<Button
							variant="unstyled"
							className="secondary-button min-h-10 border-border-dialog bg-white px-4.5 text-ink-body shadow-xs hover:not-disabled:border-border-input-hover hover:not-disabled:bg-neutral-100 hover:not-disabled:text-foreground dark:border-white/14 dark:bg-night-item dark:text-neutral-300 dark:shadow-[0_1px_2px_rgba(0,0,0,0.35)] dark:hover:not-disabled:border-white/24 dark:hover:not-disabled:bg-night-item-active dark:hover:not-disabled:text-neutral-50"
							type="button"
							onClick={onClose}
						>
							Cancel
						</Button>
						<Button
							variant="unstyled"
							className="primary-button min-h-10 min-w-dialog-btn px-4.5 shadow-xs max-compact:min-w-0"
							type="submit"
							disabled={post.isPending}
						>
							{post.isPending ? 'Publishing…' : status === 'resolved' ? 'Resolve incident' : 'Post update'}
						</Button>
					</div>
				</form>
			</DialogContent>
		</Dialog>
	);
}
