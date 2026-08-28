import { type FormEvent, useState } from 'react';
import { ArrowLeft, BellRing, Send, Zap } from 'lucide-react';
import type { NotificationSettings } from '../api/settings';
import { navigate } from '../lib/router';
import { useLogoutMutation } from '../queries/auth';
import {
	useNotificationSettingsQuery,
	useTestNotificationWebhookMutation,
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
				<input
					id="webhook-url"
					type="url"
					value={webhookUrl}
					onChange={(event) => setWebhookUrl(event.target.value)}
					placeholder="https://hooks.example.com/services/…"
				/>
			</label>
			<label className="settings-toggle" htmlFor="webhook-enabled" aria-label="Enable incident alerts">
				<input
					id="webhook-enabled"
					type="checkbox"
					checked={webhookEnabled}
					onChange={(event) => setWebhookEnabled(event.target.checked)}
				/>
				<span>
					<strong>Enable incident alerts</strong>
					<small>Send a webhook when a monitor goes down and when it recovers.</small>
				</span>
			</label>
			<div className="settings-actions">
				<button
					className="secondary-button"
					type="button"
					onClick={() => testMutation.mutate()}
					disabled={!settings.webhookUrl || testMutation.isPending}
				>
					<Send /> {testMutation.isPending ? 'Sending…' : 'Send test'}
				</button>
				<button className="primary-button" type="submit" disabled={updateMutation.isPending}>
					{updateMutation.isPending ? 'Saving…' : 'Save settings'}
				</button>
			</div>
			{updateMutation.isSuccess && <p className="settings-success">Notification settings saved.</p>}
			{testMutation.isSuccess && <p className="settings-success">Test webhook delivered successfully.</p>}
			{(updateMutation.isError || testMutation.isError) && (
				<p className="form-error">{(updateMutation.error ?? testMutation.error)?.message ?? 'Request failed'}</p>
			)}
		</form>
	);
}

export function SettingsPage() {
	const settingsQuery = useNotificationSettingsQuery();
	const logoutMutation = useLogoutMutation();
	return (
		<div className="dashboard-shell">
			<header className="dashboard-header">
				<div className="dashboard-header-inner">
					<button className="brand brand-button" onClick={() => navigate('/dashboard')}>
						<Zap className="brand-mark" fill="currentColor" />
						<span>upwatch</span>
					</button>
					<div className="nav-actions">
						<span className="header-context">Settings</span>
						<button className="nav-auth" onClick={() => logoutMutation.mutate()}>
							Sign out
						</button>
					</div>
				</div>
			</header>
			<main className="settings-main">
				<button className="back-link" type="button" onClick={() => navigate('/dashboard')}>
					<ArrowLeft /> Dashboard
				</button>
				<section className="settings-heading">
					<p className="overline">Integrations</p>
					<h1>Notifications</h1>
					<p>Route monitor transitions to Slack, Discord, or any service that accepts JSON webhooks.</p>
				</section>
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
						<p className="form-error">Unable to load notification settings.</p>
					) : (
						<SettingsForm key={settingsQuery.data.settings.updatedAt ?? 'new'} settings={settingsQuery.data.settings} />
					)}
				</section>
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
