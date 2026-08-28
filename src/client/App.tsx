import { RequireAuth } from "./components/RequireAuth";
import { usePathname } from "./lib/router";
import { DashboardPage } from "./pages/DashboardPage";
import { LoginPage } from "./pages/LoginPage";
import { MonitorDetailPage } from "./pages/MonitorDetailPage";
import { SettingsPage } from "./pages/SettingsPage";

function App() {
	const pathname = usePathname();
	if (pathname === "/login") return <LoginPage />;
	const monitorMatch = pathname.match(/^\/monitors\/(\d+)\/?$/);
	const page = monitorMatch
		? <MonitorDetailPage id={Number(monitorMatch[1])} />
		: pathname === "/settings"
			? <SettingsPage />
			: <DashboardPage />;
	return (
		<RequireAuth>
			{page}
		</RequireAuth>
	);
}

export default App;
