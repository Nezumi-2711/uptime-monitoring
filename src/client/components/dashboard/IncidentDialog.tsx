import { type FormEvent, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { IncidentImpact, IncidentStatus } from '../../api/incidents';
import { useCreateIncidentMutation, useDraftIncidentMutation } from '../../queries/incidents';
import { useMonitorsQuery } from '../../queries/monitors';
import { AiComposeField } from './AiComposeField';
import { INCIDENT_IMPACTS, INCIDENT_STATUSES, IncidentImpactOption, IncidentStatusOption } from './IncidentSelectOption';

export function IncidentDialog({ onClose }: { onClose(): void }) {
	const monitors = useMonitorsQuery();
	const create = useCreateIncidentMutation();
	const draft = useDraftIncidentMutation();
	const [form, setForm] = useState<{
		title: string;
		status: IncidentStatus;
		impact: IncidentImpact;
		body: string;
		note: string;
		monitorIds: number[];
	}>({
		title: '',
		status: 'investigating',
		impact: 'major',
		body: '',
		note: '',
		monitorIds: [],
	});
	const [generated, setGenerated] = useState(false);
	const availableMonitors = monitors.data?.monitors ?? [];
	function generate() {
		draft.mutate(
			{ note: form.note, status: form.status, monitorIds: form.monitorIds },
			{
				onSuccess: (result) => {
					setForm((current) => ({ ...current, title: result.title, body: result.body }));
					setGenerated(true);
				},
			},
		);
	}
	function submit(event: FormEvent) {
		event.preventDefault();
		create.mutate({ ...form, note: form.note || null }, { onSuccess: onClose });
	}
	return (
		<Dialog open onOpenChange={(open) => !open && !create.isPending && onClose()}>
			<DialogContent className="flex max-h-[min(90dvh,820px)] w-[min(var(--spacing-dialog-max),calc(100%-32px))] max-w-dialog-max flex-col gap-0 overflow-hidden rounded-dialog p-0 max-sm:max-h-[calc(100dvh-24px)] max-sm:w-[calc(100%-24px)] max-sm:rounded-xl max-compact:bottom-0 max-compact:top-auto max-compact:max-h-[calc(100dvh-8px)] max-compact:w-full max-compact:max-w-none max-compact:translate-y-0 max-compact:rounded-b-none max-compact:rounded-t-2xl dark:border-white/10 dark:bg-night-card dark:shadow-[0_24px_64px_-12px_rgba(0,0,0,0.85),0_0_0_1px_rgba(255,255,255,0.06)]">
				<DialogHeader className="gap-1.25 border-b border-border bg-linear-to-b from-white to-surface-hover p-6 pb-5 pl-7 pr-16 max-sm:py-4.5 max-sm:pl-5 max-sm:pr-14.5 max-compact:pb-4.25 max-compact:pl-4.5 max-compact:pr-13 max-compact:pt-5 dark:border-white/8 dark:bg-linear-to-b dark:from-night-card dark:to-[#101318]">
					<p className="overline mb-0.75 text-brand-deep dark:text-emerald-400">Incident management</p>
					<DialogTitle className="text-dialog-title leading-tight tracking-tight max-compact:text-brand-title">
						Declare incident
					</DialogTitle>
					<DialogDescription>Turn a short internal note into a clear customer-facing update.</DialogDescription>
				</DialogHeader>
				<form className="flex min-h-0 flex-1 flex-col overflow-hidden" onSubmit={submit}>
					<div className="grid min-h-0 flex-1 gap-5.5 overflow-y-auto overscroll-contain p-6 px-7 pb-7 scrollbar-gutter-stable max-sm:gap-5 max-sm:p-5 max-compact:gap-4.5 max-compact:p-4.5">
						<div className="grid grid-cols-[minmax(150px,0.85fr)_minmax(150px,0.85fr)_minmax(260px,1.6fr)] gap-4 max-sm:grid-cols-2 max-compact:grid-cols-1 **:data-[slot=select-trigger]:w-full">
							<div className="field">
								<span id="incident-status-label">Status</span>
								<Select value={form.status} onValueChange={(status) => setForm({ ...form, status: status as IncidentStatus })}>
									<SelectTrigger aria-labelledby="incident-status-label">
										<SelectValue>
											<IncidentStatusOption value={form.status} />
										</SelectValue>
									</SelectTrigger>
									<SelectContent>
										{INCIDENT_STATUSES.map((status) => (
											<SelectItem key={status} value={status}>
												<IncidentStatusOption value={status} />
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
							<div className="field">
								<span id="incident-impact-label">Impact</span>
								<Select value={form.impact} onValueChange={(impact) => setForm({ ...form, impact: impact as IncidentImpact })}>
									<SelectTrigger aria-labelledby="incident-impact-label">
										<SelectValue>
											<IncidentImpactOption value={form.impact} />
										</SelectValue>
									</SelectTrigger>
									<SelectContent>
										{INCIDENT_IMPACTS.map((impact) => (
											<SelectItem key={impact} value={impact}>
												<IncidentImpactOption value={impact} />
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
							<label
								className="field min-w-0 max-sm:col-span-full max-compact:col-auto [&_input]:placeholder:text-caption"
								htmlFor="incident-title"
							>
								<span>Public title</span>
								<Input
									id="incident-title"
									value={form.title}
									onChange={(event) => setForm({ ...form, title: event.target.value })}
									placeholder="Briefly describe the disruption"
									maxLength={120}
									required
								/>
							</label>
						</div>
						<fieldset className="min-w-0 border-0 p-0">
							<legend className="mb-2 text-caption font-medium text-ink-label dark:text-neutral-300">
								Affected services{' '}
								<small className="ml-1.5 font-normal text-footnote text-muted-foreground dark:text-neutral-400">Optional</small>
							</legend>
							<div className="flex min-h-13 max-h-skeleton-h flex-wrap gap-2 overflow-y-auto rounded-md border border-border bg-surface-soft p-2.5 dark:border-white/8 dark:bg-night-subtle">
								{availableMonitors.length ? (
									availableMonitors.map((monitor) => (
										<label
											key={monitor.id}
											className="inline-flex min-h-8 cursor-pointer items-center gap-2 rounded-md border border-border-subtle bg-white px-2.5 py-1.25 text-caption text-ink-body transition-colors hover:border-[#bcbcbc] hover:bg-surface-hover has-checked:border-border-accent-checked has-checked:bg-brand/10 dark:border-white/10 dark:bg-night-item dark:text-neutral-300 dark:hover:border-white/20 dark:hover:bg-night-item-hover dark:has-checked:border-brand/40 dark:has-checked:bg-brand/12 dark:has-checked:text-brand [&_input]:size-3.5 [&_input]:accent-brand-deep"
										>
											<input
												type="checkbox"
												checked={form.monitorIds.includes(monitor.id)}
												onChange={(event) =>
													setForm({
														...form,
														monitorIds: event.target.checked
															? [...form.monitorIds, monitor.id]
															: form.monitorIds.filter((id) => id !== monitor.id),
													})
												}
											/>
											<span>{monitor.name}</span>
										</label>
									))
								) : (
									<p className="flex min-h-7.5 items-center px-0.5 text-caption text-muted-foreground dark:text-neutral-400">
										{monitors.isPending ? 'Loading services…' : 'No monitors available'}
									</p>
								)}
							</div>
						</fieldset>
						<AiComposeField
							note={form.note}
							body={form.body}
							onNoteChange={(note) => setForm({ ...form, note })}
							onBodyChange={(body) => setForm({ ...form, body })}
							onGenerate={generate}
							isPending={draft.isPending}
							error={draft.error}
							generated={generated}
						/>
						{create.isError && (
							<p className="form-error" role="alert">
								{create.error.message}
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
							disabled={create.isPending}
						>
							{create.isPending ? 'Publishing…' : 'Declare incident'}
						</Button>
					</div>
				</form>
			</DialogContent>
		</Dialog>
	);
}
