import { useState } from 'react';
import type { Monitor } from '../api/monitors';
import { AppHeader } from '../components/AppHeader';
import { DashboardFooter } from '../components/dashboard/DashboardFooter';
import { DashboardOverview } from '../components/dashboard/DashboardOverview';
import { IncidentsPanel } from '../components/dashboard/IncidentsPanel';
import { MonitorFormDialog } from '../components/dashboard/MonitorFormDialog';
import { MonitorListPanel } from '../components/dashboard/MonitorListPanel';
import { useSeo } from '../lib/seo';

export function DashboardPage() {
	const [editing, setEditing] = useState<Monitor | null>(null);
	const [formOpen, setFormOpen] = useState(false);
	useSeo({ title: 'Dashboard — upwatch', noindex: true });

	function openCreateForm() {
		setEditing(null);
		setFormOpen(true);
	}

	function openEditForm(monitor: Monitor) {
		setEditing(monitor);
		setFormOpen(true);
	}

	function closeForm() {
		setFormOpen(false);
		setEditing(null);
	}

	return (
		<div className="dashboard-shell">
			<AppHeader context="Production monitors" />

			<main className="dashboard-main">
				<DashboardOverview onAddMonitor={openCreateForm} />

				{formOpen ? <MonitorFormDialog key={editing?.id ?? 'create'} editing={editing} onClose={closeForm} /> : null}

				<MonitorListPanel formOpen={formOpen} onAddMonitor={openCreateForm} onEdit={openEditForm} />
				<IncidentsPanel />
			</main>

			<DashboardFooter />
		</div>
	);
}
