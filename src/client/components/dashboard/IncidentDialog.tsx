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
			<DialogContent className="incident-dialog max-h-[90vh] w-[calc(100%-2rem)] overflow-y-auto sm:max-w-2xl">
				<DialogHeader>
					<p className="overline">Incident management</p>
					<DialogTitle>Declare incident</DialogTitle>
					<DialogDescription>Turn a short internal note into a clear customer-facing update.</DialogDescription>
				</DialogHeader>
				<form className="incident-form" onSubmit={submit}>
					<div className="incident-form-grid">
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
						<label className="field incident-title-field" htmlFor="incident-title">
							<span>Public title</span>
							<Input
								id="incident-title"
								value={form.title}
								onChange={(event) => setForm({ ...form, title: event.target.value })}
								maxLength={120}
								required
							/>
						</label>
					</div>
					<fieldset className="incident-service-picker">
						<legend>
							Affected services <small>Optional</small>
						</legend>
						<div className="incident-service-options">
							{monitors.data?.monitors.map((monitor) => (
								<label key={monitor.id}>
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
							))}
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
					<div className="form-actions compact-actions">
						<Button variant="unstyled" className="secondary-button" type="button" onClick={onClose}>
							Cancel
						</Button>
						<Button variant="unstyled" className="primary-button" type="submit" disabled={create.isPending}>
							{create.isPending ? 'Publishing…' : 'Declare incident'}
						</Button>
					</div>
					{create.isError && (
						<p className="form-error" role="alert">
							{create.error.message}
						</p>
					)}
				</form>
			</DialogContent>
		</Dialog>
	);
}
