import { type FormEvent, useState } from 'react';
import { ArrowLeft, BellRing, Send, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Empty, EmptyTitle } from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import type { AiSettings, NotificationSettings } from '../api/settings';
import { AppHeader } from '../components/AppHeader';
import { navigate } from '../lib/router';
import {
	useAiSettingsQuery,
	useNotificationSettingsQuery,
	useTestAiSettingsMutation,
	useTestNotificationWebhookMutation,
	useUpdateAiSettingsMutation,
	useUpdateNotificationSettingsMutation,
} from '../queries/settings';

function SettingsForm({ settings }: { settings: NotificationSettings }) {
	const [webhookUrl, setWebhookUrl] = useState(settings.webhookUrl ?? '');
	const [webhookEnabled, setWebhookEnabled] = useState(settings.webhookEnabled);
	const updateMutation = useUpdateNotificationSettingsMutation();
	const testMutation = useTestNotificationWebhookMutation();

	function submit(event: FormEvent) {
		event.preventDefault();
		updateMutation.mutate({ webhookUrl: webhookUrl.trim() || null, webhookEnabled });
	}

	return (
		<form className="settings-form" onSubmit={submit}>
			<label className="field" htmlFor="webhook-url">
				<span>Webhook URL</span>
				<Input
					id="webhook-url"
					type="url"
					value={webhookUrl}
					onChange={(event) => setWebhookUrl(event.target.value)}
					placeholder="https://hooks.example.com/services/…"
				/>
			</label>
			<div className="settings-toggle">
				<Switch id="webhook-enabled" checked={webhookEnabled} onCheckedChange={setWebhookEnabled} />
				<label htmlFor="webhook-enabled">
					<strong>Enable incident alerts</strong>
					<small>Send a webhook when a monitor goes down and when it recovers.</small>
				</label>
			</div>
			<div className="settings-actions">
				<Button
					variant="unstyled"
					className="secondary-button"
					type="button"
					onClick={() => testMutation.mutate()}
					disabled={!settings.webhookUrl || testMutation.isPending}
				>
					<Send /> {testMutation.isPending ? 'Sending…' : 'Send test'}
				</Button>
				<Button variant="unstyled" className="primary-button" type="submit" disabled={updateMutation.isPending}>
					{updateMutation.isPending ? 'Saving…' : 'Save settings'}
				</Button>
			</div>
			{updateMutation.isSuccess && <p className="settings-success">Notification settings saved.</p>}
			{testMutation.isSuccess && <p className="settings-success">Test webhook delivered successfully.</p>}
			{(updateMutation.isError || testMutation.isError) && (
				<p className="form-error">{(updateMutation.error ?? testMutation.error)?.message ?? 'Request failed'}</p>
			)}
		</form>
	);
}

function AiSettingsForm({ settings }: { settings: AiSettings }) {
	const [baseUrl, setBaseUrl] = useState(settings.baseUrl ?? 'https://api.openai.com/v1');
	const [apiKey, setApiKey] = useState('');
	const [model, setModel] = useState(settings.model ?? 'gpt-4o-mini');
	const [enabled, setEnabled] = useState(settings.enabled);
	const updateMutation = useUpdateAiSettingsMutation();
	const testMutation = useTestAiSettingsMutation();

	function submit(event: FormEvent) {
		event.preventDefault();
		updateMutation.mutate({
			enabled,
			baseUrl: baseUrl.trim() || null,
			model: model.trim() || null,
			apiKey: apiKey.trim() || null,
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
	const settingsQuery = useNotificationSettingsQuery();
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
					<h1>Notifications &amp; AI</h1>
					<p>Configure incident alerts and visitor-friendly status updates from one place.</p>
				</section>
				<Card asChild>
					<section className="settings-card">
						<div className="settings-card-intro">
							<span>
								<BellRing />
							</span>
							<div>
								<h2>Incident webhook</h2>
								<p>Upwatch sends a compact JSON payload for down and recovery events. Delivery failures never interrupt monitoring.</p>
							</div>
						</div>
						{settingsQuery.isPending ? (
							<div className="table-empty">Loading settings…</div>
						) : settingsQuery.isError ? (
							<Empty variant="error" className="m-6">
								<EmptyTitle>Unable to load notification settings</EmptyTitle>
							</Empty>
						) : (
							<SettingsForm key={settingsQuery.data.settings.updatedAt ?? 'new'} settings={settingsQuery.data.settings} />
						)}
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
				<section className="payload-preview">
					<p className="overline">Payload preview</p>
					<pre>{`{
  "event": "down",
  "monitor": { "id": 12, "name": "API", "url": "https://api.example.com" },
  "statusCode": 500,
  "error": "Expected HTTP 200, received 500",
  "at": "2026-08-28T03:25:00.000Z"
}`}</pre>
				</section>
			</main>
		</div>
	);
}
