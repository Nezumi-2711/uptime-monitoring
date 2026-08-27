import { RequireAuth } from "./components/RequireAuth";
import { usePathname } from "./lib/router";
import { DashboardPage } from "./pages/DashboardPage";
import { LoginPage } from "./pages/LoginPage";

function App() {
	const pathname = usePathname();
	if (pathname === "/login") return <LoginPage />;
	return (
		<RequireAuth>
			<DashboardPage />
		</RequireAuth>
	);
}

export default App;
