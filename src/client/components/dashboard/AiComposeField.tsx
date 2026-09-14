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
		<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
			<div className="flex min-w-0 flex-col gap-2">
				<div className="flex items-baseline justify-between gap-2.5 max-compact:flex-col max-compact:items-start max-compact:gap-0.5">
					<label htmlFor="incident-note" className="text-caption font-medium text-ink-label dark:text-neutral-300">
						Internal note
					</label>
					<small className="ml-0 font-normal tabular-nums whitespace-nowrap text-footnote text-muted-foreground dark:text-neutral-400">
						Admin only · {note.length}/1000
					</small>
				</div>
				<textarea
					id="incident-note"
					className="min-h-textarea-h w-full resize-y rounded-sm border border-border bg-background px-3.5 py-3 font-inherit leading-normal text-foreground outline-none transition-colors placeholder:text-faint hover:border-border-input-hover focus-visible:border-brand-deep focus-visible:shadow-[0_0_0_3px_rgb(36_180_126/0.14)] max-compact:min-h-textarea-sm-h dark:border-white/12 dark:bg-night-input/85 dark:text-neutral-50 dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.4)] dark:hover:border-white/22 dark:focus-visible:border-brand"
					value={note}
					onChange={(event) => onNoteChange(event.target.value)}
					maxLength={1000}
					placeholder="e.g. Redis is at capacity; scaling is in progress"
				/>
				{enabled ? (
					<Button
						variant="unstyled"
						className="secondary-button mt-0.5 min-h-9 self-start py-1.5"
						type="button"
						onClick={onGenerate}
						disabled={isPending || !note.trim()}
					>
						<Sparkles className={isPending ? 'is-spinning' : ''} />{' '}
						{isPending ? 'Composing…' : generated ? 'Generate again' : 'Compose public update'}
					</Button>
				) : settings.isPending ? null : (
					<p className="mt-0.5 text-caption text-muted-foreground dark:text-neutral-400 [&>button]:cursor-pointer [&>button]:border-0 [&>button]:bg-transparent [&>button]:p-0 [&>button]:text-accent-green [&>button]:underline [&>button]:underline-offset-2 dark:[&>button]:text-brand">
						AI composition is unavailable.{' '}
						<button type="button" onClick={() => navigate('/settings')}>
							Configure it in Settings
						</button>
						, or write below.
					</p>
				)}
			</div>
			<div className="flex min-w-0 flex-col gap-2">
				<div className="flex items-baseline justify-between gap-2.5 max-compact:flex-col max-compact:items-start max-compact:gap-0.5">
					<label htmlFor="incident-public-body" className="text-caption font-medium text-ink-label dark:text-neutral-300">
						Public update
					</label>
					<small className="ml-0 font-normal tabular-nums whitespace-nowrap text-footnote text-muted-foreground dark:text-neutral-400">
						Customer-facing · {body.length}/2000
					</small>
				</div>
				<textarea
					id="incident-public-body"
					className="min-h-textarea-h w-full resize-y rounded-sm border border-border bg-background px-3.5 py-3 font-inherit leading-normal text-foreground outline-none transition-colors placeholder:text-faint hover:border-border-input-hover focus-visible:border-brand-deep focus-visible:shadow-[0_0_0_3px_rgb(36_180_126/0.14)] max-compact:min-h-textarea-sm-h dark:border-white/12 dark:bg-night-input/85 dark:text-neutral-50 dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.4)] dark:hover:border-white/22 dark:focus-visible:border-brand"
					value={body}
					onChange={(event) => onBodyChange(event.target.value)}
					placeholder="Explain the impact and what your team is doing"
					maxLength={2000}
					required
					aria-busy={isPending}
				/>
			</div>
			{error ? (
				<p className="col-span-full form-error" role="alert">
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
