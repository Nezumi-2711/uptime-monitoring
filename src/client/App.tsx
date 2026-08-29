import { TooltipProvider } from '@/components/ui/tooltip';
import { RequireAuth } from './components/RequireAuth';
import { usePathname } from './lib/router';
import { DashboardPage } from './pages/DashboardPage';
import { LoginPage } from './pages/LoginPage';
import { MonitorDetailPage } from './pages/MonitorDetailPage';
import { SettingsPage } from './pages/SettingsPage';
import { StatusPage } from './pages/StatusPage';

function App() {
	const pathname = usePathname();
	let content;
	if (pathname === '/') content = <StatusPage />;
	else if (pathname === '/login') content = <LoginPage />;
	else {
		const monitorMatch = pathname.match(/^\/monitors\/(\d+)\/?$/);
		const page = monitorMatch ? (
			<MonitorDetailPage id={Number(monitorMatch[1])} />
		) : pathname === '/settings' ? (
			<SettingsPage />
		) : (
			<DashboardPage />
		);
		content = <RequireAuth>{page}</RequireAuth>;
	}

	return <TooltipProvider>{content}</TooltipProvider>;
}

export default App;
