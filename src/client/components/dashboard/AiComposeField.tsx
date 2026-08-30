import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ApiError } from '../../api/http';
import { navigate } from '../../lib/router';
import { useAiSettingsQuery } from '../../queries/settings';

export function AiComposeField({
	note,
	body,
	onNoteChange,
	onBodyChange,
	onGenerate,
	isPending,
	error,
	generated,
}: {
	note: string;
	body: string;
	onNoteChange(value: string): void;
	onBodyChange(value: string): void;
	onGenerate(): void;
	isPending: boolean;
	error: unknown;
	generated: boolean;
}) {
	const settings = useAiSettingsQuery();
	const enabled =
		settings.data?.settings.enabled && settings.data.settings.apiKeySet && settings.data.settings.baseUrl && settings.data.settings.model;
	return (
		<div className="ai-compose-field">
			<div className="ai-compose-pane">
				<div className="ai-compose-pane-header">
					<label htmlFor="incident-note">Internal note</label>
					<small>Admin only</small>
				</div>
				<textarea
					id="incident-note"
					value={note}
					onChange={(event) => onNoteChange(event.target.value)}
					maxLength={1000}
					placeholder="redis full memory, scaling capacity"
				/>
				{enabled ? (
					<Button
						variant="unstyled"
						className="secondary-button ai-compose-button"
						type="button"
						onClick={onGenerate}
						disabled={isPending || !note.trim()}
					>
						<Sparkles className={isPending ? 'is-spinning' : ''} />{' '}
						{isPending ? 'Composing…' : generated ? 'Generate again' : 'Compose public update'}
					</Button>
				) : settings.isPending ? null : (
					<p className="ai-compose-hint">
						AI composition is unavailable.{' '}
						<button type="button" onClick={() => navigate('/settings')}>
							Configure it in Settings
						</button>
						, or write below.
					</p>
				)}
			</div>
			<div className="ai-compose-pane">
				<div className="ai-compose-pane-header">
					<label htmlFor="incident-public-body">Public update</label>
					<small>Customer-facing</small>
				</div>
				<textarea
					id="incident-public-body"
					value={body}
					onChange={(event) => onBodyChange(event.target.value)}
					maxLength={2000}
					required
					aria-busy={isPending}
				/>
			</div>
			{error ? (
				<p className="form-error" role="alert">
					{error instanceof ApiError && error.status === 422
						? 'AI could not create a safe update. Edit the note or write the update manually.'
						: error instanceof Error
							? error.message
							: 'Unable to compose update'}
				</p>
			) : null}
		</div>
	);
}
