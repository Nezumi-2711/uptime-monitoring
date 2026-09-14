import { useState } from 'react';
import { AppHeader } from '../components/AppHeader';
import { DashboardFooter } from '../components/dashboard/DashboardFooter';
import { DashboardOverview } from '../components/dashboard/DashboardOverview';
import { IncidentsPanel } from '../components/dashboard/IncidentsPanel';
import { MonitorFormDialog } from '../components/dashboard/MonitorFormDialog';
import { MonitorListPanel } from '../components/dashboard/MonitorListPanel';
import { useSeo } from '../lib/seo';

export function DashboardPage() {
	const [formOpen, setFormOpen] = useState(false);
	useSeo({ title: 'Dashboard — upwatch', noindex: true });

	function openCreateForm() {
		setFormOpen(true);
	}

	function closeForm() {
		setFormOpen(false);
	}

	return (
		<div className="dashboard-shell">
			<AppHeader context="Production monitors" />

			<main className="dashboard-main">
				<DashboardOverview onAddMonitor={openCreateForm} />

				{formOpen ? <MonitorFormDialog editing={null} onClose={closeForm} /> : null}

				<MonitorListPanel formOpen={formOpen} onAddMonitor={openCreateForm} />
				<IncidentsPanel />
			</main>

			<DashboardFooter />
		</div>
	);
}
