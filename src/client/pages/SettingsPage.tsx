import { type FormEvent, useState } from 'react';
import { Activity, ArrowLeft, BellRing, Sparkles, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Empty, EmptyTitle } from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import type { AiSettings } from '../api/settings';
import { AppHeader } from '../components/AppHeader';
import { AiActivityPanel } from '../components/settings/AiActivityPanel';
import { MaintenanceWindowsPanel } from '../components/settings/MaintenanceWindowsPanel';
import { NotificationChannelsPanel } from '../components/settings/NotificationChannelsPanel';
import { navigate } from '../lib/router';
import { useAiSettingsQuery, useTestAiSettingsMutation, useUpdateAiSettingsMutation } from '../queries/settings';

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
		<form className="settings-form" onSubmit={submit}>
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
				{settings.apiKeySet && <small className="field-helper">Leave blank to keep the current key.</small>}
			</label>
			<label className="field" htmlFor="ai-model">
				<span>Model</span>
				<Input id="ai-model" type="text" value={model} onChange={(event) => setModel(event.target.value)} placeholder="gpt-4o-mini" />
			</label>
			<div className="settings-toggle">
				<Switch id="ai-enabled" checked={enabled} onCheckedChange={setEnabled} />
				<label htmlFor="ai-enabled">
					<strong>Enable AI incident messages</strong>
					<small>Generate one sanitized public update when an incident opens.</small>
				</label>
			</div>
			<fieldset className="autopilot-settings">
				<legend>Autopilot</legend>
				<div className="settings-toggle">
					<Switch id="autopilot-enabled" checked={autopilotEnabled} onCheckedChange={setAutopilotEnabled} />
					<label htmlFor="autopilot-enabled">
						<strong>Enable incident autopilot</strong>
						<small>Write sanitized opening, follow-up, and resolution updates without sending extra alerts.</small>
					</label>
				</div>
				<div className="autopilot-number-fields">
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
				<div className="settings-toggle">
					<Switch id="autopilot-advance-status" checked={advanceStatus} onCheckedChange={setAdvanceStatus} />
					<label htmlFor="autopilot-advance-status">
						<strong>Advance incident status</strong>
						<small>Use objective check patterns to move between investigating, identified, and monitoring.</small>
					</label>
				</div>
				<div className="settings-toggle">
					<Switch id="autopilot-degraded" checked={degradedIncidents} onCheckedChange={setDegradedIncidents} />
					<label htmlFor="autopilot-degraded">
						<strong>Open degraded incidents</strong>
						<small>Publish performance degradation incidents. Keep disabled to avoid public noise.</small>
					</label>
				</div>
			</fieldset>
			<div className="settings-actions">
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
			{updateMutation.isSuccess && <p className="settings-success">AI settings saved.</p>}
			{testMutation.isSuccess && <p className="settings-success">{testMutation.data.message}</p>}
			{(updateMutation.isError || testMutation.isError) && (
				<p className="form-error">{(updateMutation.error ?? testMutation.error)?.message ?? 'Request failed'}</p>
			)}
		</form>
	);
}

export function SettingsPage() {
	const aiSettingsQuery = useAiSettingsQuery();
	return (
		<div className="dashboard-shell">
			<AppHeader context="Settings" />
			<main className="settings-main">
				<Button variant="unstyled" className="back-link" type="button" onClick={() => navigate('/dashboard')}>
					<ArrowLeft /> Dashboard
				</Button>
				<section className="settings-heading">
					<p className="overline">Integrations</p>
					<h1>Notifications, AI &amp; maintenance</h1>
					<p>Configure incident alerts, visitor-friendly updates, and planned downtime from one place.</p>
				</section>
				<Card asChild>
					<section className="settings-card">
						<div className="settings-card-intro">
							<span>
								<Activity />
							</span>
							<div>
								<h2>AI activity</h2>
								<p>Audit model calls, sanitizer rejections, latency, and token usage from the last seven days.</p>
							</div>
						</div>
						<AiActivityPanel />
					</section>
				</Card>
				<Card asChild>
					<section className="settings-card">
						<div className="settings-card-intro">
							<span>
								<BellRing />
							</span>
							<div>
								<h2>Notification channels</h2>
								<p>Route incidents to Slack, Discord, Telegram, or existing webhook integrations, with delivery history.</p>
							</div>
						</div>
						<NotificationChannelsPanel />
					</section>
				</Card>
				<Card asChild>
					<section className="settings-card">
						<div className="settings-card-intro">
							<span>
								<Sparkles />
							</span>
							<div>
								<h2>AI incident messages</h2>
								<p>
									Turn technical check failures into short, sanitized updates for visitors. Generation runs only when an incident opens.
								</p>
							</div>
						</div>
						{aiSettingsQuery.isPending ? (
							<div className="table-empty">Loading settings…</div>
						) : aiSettingsQuery.isError ? (
							<Empty variant="error" className="m-6">
								<EmptyTitle>Unable to load AI settings</EmptyTitle>
							</Empty>
						) : (
							<AiSettingsForm key={aiSettingsQuery.data.settings.updatedAt ?? 'new'} settings={aiSettingsQuery.data.settings} />
						)}
					</section>
				</Card>
				<Card asChild>
					<section className="settings-card maintenance-settings-card">
						<div className="settings-card-intro">
							<span>
								<Wrench />
							</span>
							<div>
								<h2>Maintenance windows</h2>
								<p>Keep probing during planned work while suppressing alerts and excluding those checks from uptime.</p>
							</div>
						</div>
						<MaintenanceWindowsPanel />
					</section>
				</Card>
			</main>
		</div>
	);
}
