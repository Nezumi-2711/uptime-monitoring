import { lazy, Suspense } from 'react';
import { RequireAuth } from './components/RequireAuth';
import { usePathname } from './lib/router';

const DashboardPage = lazy(() => import('./pages/DashboardPage').then((module) => ({ default: module.DashboardPage })));
const IncidentDetailPage = lazy(() => import('./pages/IncidentDetailPage').then((module) => ({ default: module.IncidentDetailPage })));
const LoginPage = lazy(() => import('./pages/LoginPage').then((module) => ({ default: module.LoginPage })));
const MonitorDetailPage = lazy(() => import('./pages/MonitorDetailPage').then((module) => ({ default: module.MonitorDetailPage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((module) => ({ default: module.SettingsPage })));
const StatusPage = lazy(() => import('./pages/StatusPage').then((module) => ({ default: module.StatusPage })));

function PageFallback() {
	return (
		<main className="full-page-loading" aria-busy="true" aria-label="Loading page">
			<p>Loading…</p>
		</main>
	);
}

function App() {
	const pathname = usePathname();
	let content;
	if (pathname === '/') content = <StatusPage />;
	else if (pathname === '/login') content = <LoginPage />;
	else {
		const incidentMatch = pathname.match(/^\/incidents\/(\d+)\/?$/);
		const monitorMatch = pathname.match(/^\/monitors\/(\d+)\/?$/);
		if (incidentMatch) content = <IncidentDetailPage id={Number(incidentMatch[1])} />;
		else {
			const page = monitorMatch ? (
				<MonitorDetailPage id={Number(monitorMatch[1])} />
			) : pathname === '/settings' ? (
				<SettingsPage />
			) : (
				<DashboardPage />
			);
			content = <RequireAuth>{page}</RequireAuth>;
		}
	}

	return <Suspense fallback={<PageFallback />}>{content}</Suspense>;
}

export default App;
