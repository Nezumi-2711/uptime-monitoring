import { type FormEvent, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Empty, EmptyTitle } from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import type { AiSettings } from '../../api/settings';
import { useAiSettingsQuery, useTestAiSettingsMutation, useUpdateAiSettingsMutation } from '../../queries/settings';

function AiSettingsForm({ settings }: { settings: AiSettings }) {
	const [baseUrl, setBaseUrl] = useState(settings.baseUrl ?? 'https://api.openai.com/v1');
	const [apiKey, setApiKey] = useState('');
	const [model, setModel] = useState(settings.model ?? 'gpt-4o-mini');
	const [enabled, setEnabled] = useState(settings.enabled);
	const [autopilotEnabled, setAutopilotEnabled] = useState(settings.autopilotEnabled);
	const [followupMinutes, setFollowupMinutes] = useState(settings.autopilotFollowupMinutes);
	const [maxUpdates, setMaxUpdates] = useState(settings.autopilotMaxUpdates);
	const [advanceStatus, setAdvanceStatus] = useState(settings.autopilotAdvanceStatus);
	const [degradedIncidents, setDegradedIncidents] = useState(settings.autopilotDegradedIncidents);
	const updateMutation = useUpdateAiSettingsMutation();
	const testMutation = useTestAiSettingsMutation();

	function submit(event: FormEvent) {
		event.preventDefault();
		updateMutation.mutate({
			enabled,
			baseUrl: baseUrl.trim() || null,
			model: model.trim() || null,
			apiKey: apiKey.trim() || null,
			autopilotEnabled,
			autopilotFollowupMinutes: followupMinutes,
			autopilotMaxUpdates: maxUpdates,
			autopilotAdvanceStatus: advanceStatus,
			autopilotDegradedIncidents: degradedIncidents,
		});
	}

	return (
		<form className="grid gap-6 p-5 sm:p-panel-x text-item" onSubmit={submit}>
			<label className="field" htmlFor="ai-base-url">
				<span>Base URL</span>
				<Input
					id="ai-base-url"
					type="url"
					value={baseUrl}
					onChange={(event) => setBaseUrl(event.target.value)}
					placeholder="https://api.openai.com/v1"
				/>
			</label>
			<label className="field" htmlFor="ai-api-key">
				<span>API key</span>
				<Input
					id="ai-api-key"
					type="password"
					autoComplete="off"
					value={apiKey}
					onChange={(event) => setApiKey(event.target.value)}
					placeholder={settings.apiKeyPreview ?? 'Enter API key'}
				/>
				{settings.apiKeySet && (
					<small className="block mt-1.75 text-footnote text-muted-text dark:text-gray-400">Leave blank to keep the current key.</small>
				)}
			</label>
			<label className="field" htmlFor="ai-model">
				<span>Model</span>
				<Input id="ai-model" type="text" value={model} onChange={(event) => setModel(event.target.value)} placeholder="gpt-4o-mini" />
			</label>
			<div className="flex items-center gap-2.75 [&>label]:cursor-pointer [&_strong]:block [&_strong]:text-caption [&_strong]:font-medium dark:[&_strong]:text-gray-50 [&_small]:block [&_small]:mt-1 [&_small]:text-muted-text dark:[&_small]:text-gray-400">
				<Switch id="ai-enabled" checked={enabled} onCheckedChange={setEnabled} />
				<label htmlFor="ai-enabled">
					<strong>Enable AI incident messages</strong>
					<small>Generate one sanitized public update when an incident opens.</small>
				</label>
			</div>
			<fieldset className="grid gap-4 my-1 p-5 rounded-lg border border-border-panel bg-surface-fieldset dark:border-white/8 dark:bg-night-subtle [&>legend]:px-1.75 [&>legend]:text-caption [&>legend]:font-semibold dark:[&>legend]:text-gray-50">
				<legend>Autopilot</legend>
				<div className="flex items-center gap-2.75 [&>label]:cursor-pointer [&_strong]:block [&_strong]:text-caption [&_strong]:font-medium dark:[&_strong]:text-gray-50 [&_small]:block [&_small]:mt-1 [&_small]:text-muted-text dark:[&_small]:text-gray-400">
					<Switch id="autopilot-enabled" checked={autopilotEnabled} onCheckedChange={setAutopilotEnabled} />
					<label htmlFor="autopilot-enabled">
						<strong>Enable incident autopilot</strong>
						<small>Write sanitized opening, follow-up, and resolution updates without sending extra alerts.</small>
					</label>
				</div>
				<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
					<label className="field" htmlFor="autopilot-cadence">
						<span>Initial follow-up cadence (minutes)</span>
						<Input
							id="autopilot-cadence"
							type="number"
							min={5}
							max={240}
							value={followupMinutes}
							onChange={(event) => setFollowupMinutes(Number(event.target.value))}
						/>
					</label>
					<label className="field" htmlFor="autopilot-max-updates">
						<span>Maximum automatic updates</span>
						<Input
							id="autopilot-max-updates"
							type="number"
							min={1}
							max={20}
							value={maxUpdates}
							onChange={(event) => setMaxUpdates(Number(event.target.value))}
						/>
					</label>
				</div>
				<div className="flex items-center gap-2.75 [&>label]:cursor-pointer [&_strong]:block [&_strong]:text-caption [&_strong]:font-medium dark:[&_strong]:text-gray-50 [&_small]:block [&_small]:mt-1 [&_small]:text-muted-text dark:[&_small]:text-gray-400">
					<Switch id="autopilot-advance-status" checked={advanceStatus} onCheckedChange={setAdvanceStatus} />
					<label htmlFor="autopilot-advance-status">
						<strong>Advance incident status</strong>
						<small>Use objective check patterns to move between investigating, identified, and monitoring.</small>
					</label>
				</div>
				<div className="flex items-center gap-2.75 [&>label]:cursor-pointer [&_strong]:block [&_strong]:text-caption [&_strong]:font-medium dark:[&_strong]:text-gray-50 [&_small]:block [&_small]:mt-1 [&_small]:text-muted-text dark:[&_small]:text-gray-400">
					<Switch id="autopilot-degraded" checked={degradedIncidents} onCheckedChange={setDegradedIncidents} />
					<label htmlFor="autopilot-degraded">
						<strong>Open degraded incidents</strong>
						<small>Publish performance degradation incidents. Keep disabled to avoid public noise.</small>
					</label>
				</div>
			</fieldset>
			<div className="flex flex-col-reverse sm:flex-row sm:justify-end items-stretch sm:items-center gap-2.5 pt-5 border-t border-border-row dark:border-t-white/7 [&_svg]:size-3.5">
				<Button
					variant="unstyled"
					className="secondary-button"
					type="button"
					onClick={() => testMutation.mutate()}
					disabled={!settings.apiKeySet || !settings.baseUrl || !settings.model || testMutation.isPending}
				>
					<Sparkles /> {testMutation.isPending ? 'Generating…' : 'Test generation'}
				</Button>
				<Button variant="unstyled" className="primary-button" type="submit" disabled={updateMutation.isPending}>
					{updateMutation.isPending ? 'Saving…' : 'Save settings'}
				</Button>
			</div>
			{updateMutation.isSuccess && (
				<p className="-mt-2 px-3 py-2.5 rounded-md border border-success-banner-border bg-success-banner-bg text-xs text-success-banner-text dark:border-brand/30 dark:bg-brand/10 dark:text-brand-soft">
					AI settings saved.
				</p>
			)}
			{testMutation.isSuccess && (
				<p className="-mt-2 px-3 py-2.5 rounded-md border border-success-banner-border bg-success-banner-bg text-xs text-success-banner-text dark:border-brand/30 dark:bg-brand/10 dark:text-brand-soft">
					{testMutation.data.message}
				</p>
			)}
			{(updateMutation.error || testMutation.error) && (
				<p className="form-error">{(updateMutation.error ?? testMutation.error)?.message ?? 'Request failed'}</p>
			)}
		</form>
	);
}

export function AiIncidentMessagesPanel() {
	const aiSettingsQuery = useAiSettingsQuery();
	if (aiSettingsQuery.isPending) return <div className="table-empty">Loading settings…</div>;
	if (aiSettingsQuery.isError) {
		return (
			<Empty variant="error" className="m-6">
				<EmptyTitle>Unable to load AI settings</EmptyTitle>
			</Empty>
		);
	}
	return <AiSettingsForm key={aiSettingsQuery.data.settings.updatedAt ?? 'new'} settings={aiSettingsQuery.data.settings} />;
}
