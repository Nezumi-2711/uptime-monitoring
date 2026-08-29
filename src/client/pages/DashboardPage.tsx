import { useState } from 'react';
import type { Monitor } from '../api/monitors';
import { DashboardFooter } from '../components/dashboard/DashboardFooter';
import { DashboardHeader } from '../components/dashboard/DashboardHeader';
import { DashboardOverview } from '../components/dashboard/DashboardOverview';
import { MonitorFormDialog } from '../components/dashboard/MonitorFormDialog';
import { MonitorListPanel } from '../components/dashboard/MonitorListPanel';

export function DashboardPage() {
	const [editing, setEditing] = useState<Monitor | null>(null);
	const [formOpen, setFormOpen] = useState(false);

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
			<DashboardHeader />

			<main className="dashboard-main">
				<DashboardOverview onAddMonitor={openCreateForm} />

				{formOpen ? <MonitorFormDialog key={editing?.id ?? 'create'} editing={editing} onClose={closeForm} /> : null}

				<MonitorListPanel formOpen={formOpen} onAddMonitor={openCreateForm} onEdit={openEditForm} />
			</main>

			<DashboardFooter />
		</div>
	);
}
