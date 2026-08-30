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
			<DialogContent className="incident-dialog max-h-[90vh] w-[calc(100%-2rem)] overflow-y-auto sm:max-w-2xl">
				<DialogHeader>
					<p className="overline">Incident update</p>
					<DialogTitle>{incident.title ?? 'Service disruption'}</DialogTitle>
					<DialogDescription>Publish the next update and advance the incident lifecycle.</DialogDescription>
				</DialogHeader>
				<form className="incident-form" onSubmit={submit}>
					<div className="field">
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
					<div className="form-actions compact-actions">
						<Button variant="unstyled" className="secondary-button" type="button" onClick={onClose}>
							Cancel
						</Button>
						<Button variant="unstyled" className="primary-button" type="submit" disabled={post.isPending}>
							{post.isPending ? 'Publishing…' : status === 'resolved' ? 'Resolve incident' : 'Post update'}
						</Button>
					</div>
					{post.isError && (
						<p className="form-error" role="alert">
							{post.error.message}
						</p>
					)}
				</form>
			</DialogContent>
		</Dialog>
	);
}
