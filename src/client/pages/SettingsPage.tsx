import { Activity, ArrowLeft, BellRing, Sparkles, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AppHeader } from '../components/AppHeader';
import { AiActivityPanel } from '../components/settings/AiActivityPanel';
import { AiIncidentMessagesPanel } from '../components/settings/AiIncidentMessagesPanel';
import { MaintenanceWindowsPanel } from '../components/settings/MaintenanceWindowsPanel';
import { NotificationChannelsPanel } from '../components/settings/NotificationChannelsPanel';
import { navigate } from '../lib/router';
import { useSeo } from '../lib/seo';

const SECTIONS = [
	{
		id: 'ai-activity',
		label: 'AI activity',
		icon: Activity,
		description: 'Audit model calls, sanitizer rejections, latency, and token usage from the last seven days.',
		Panel: AiActivityPanel,
	},
	{
		id: 'notifications',
		label: 'Notification channels',
		icon: BellRing,
		description: 'Route incidents to Slack, Discord, Telegram, or existing webhook integrations, with delivery history.',
		Panel: NotificationChannelsPanel,
	},
	{
		id: 'ai-messages',
		label: 'AI incident messages',
		icon: Sparkles,
		description: 'Turn technical check failures into short, sanitized updates for visitors. Generation runs only when an incident opens.',
		Panel: AiIncidentMessagesPanel,
	},
	{
		id: 'maintenance',
		label: 'Maintenance windows',
		icon: Wrench,
		description: 'Keep probing during planned work while suppressing alerts and excluding those checks from uptime.',
		Panel: MaintenanceWindowsPanel,
	},
] as const;

export function SettingsPage() {
	useSeo({ title: 'Settings — upwatch', noindex: true });
	return (
		<div className="dashboard-shell">
			<AppHeader context="Settings" />
			<main className="dashboard-main pt-8.5 pb-20">
				<Button variant="unstyled" className="back-link" type="button" onClick={() => navigate('/dashboard')}>
					<ArrowLeft /> Dashboard
				</Button>
				<section className="mt-10.5">
					<p className="overline">Integrations</p>
					<h1 className="m-0 text-display-sm sm:text-display font-medium tracking-display dark:text-gray-50">
						Notifications, AI &amp; maintenance
					</h1>
					<p className="mt-3 text-subtitle leading-subtitle text-muted-text dark:text-gray-400">
						Configure incident alerts, visitor-friendly updates, and planned downtime from one place.
					</p>
				</section>
				<Tabs defaultValue={SECTIONS[0].id} className="mt-9.5">
					<TabsList aria-label="Settings sections">
						{SECTIONS.map((section) => {
							const Icon = section.icon;
							return (
								<TabsTrigger key={section.id} value={section.id}>
									<Icon aria-hidden="true" />
									{section.label}
								</TabsTrigger>
							);
						})}
					</TabsList>
					{SECTIONS.map((section) => {
						const Icon = section.icon;
						const Panel = section.Panel;
						return (
							<TabsContent key={section.id} value={section.id}>
								<Card asChild>
									<section className="overflow-hidden rounded-card border border-border-subtle bg-white shadow-[0_8px_24px_rgb(0_0_0/0.035)] dark:border-white/8 dark:bg-night-panel dark:shadow-[0_16px_40px_rgba(0,0,0,0.35)]">
										<div className="flex gap-4 p-5 sm:p-panel-x border-b border-border-row dark:border-b-white/7">
											<span className="grid shrink-0 size-10.5 place-items-center rounded-lg border border-badge-green-border bg-badge-green-bg text-accent-green-hover dark:border-brand/25 dark:bg-brand/12 dark:text-brand [&>svg]:size-4.75">
												<Icon />
											</span>
											<div>
												<h2 className="m-0 text-lg font-medium dark:text-gray-50">{section.label}</h2>
												<p className="mt-1.5 text-caption leading-subtitle text-muted-text dark:text-gray-400">{section.description}</p>
											</div>
										</div>
										<Panel />
									</section>
								</Card>
							</TabsContent>
						);
					})}
				</Tabs>
			</main>
		</div>
	);
}
