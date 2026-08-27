import { type ReactNode, useEffect } from "react";
import { Zap } from "lucide-react";
import { navigate } from "../lib/router";
import { useSessionQuery } from "../queries/auth";

function FullPageLoading() {
	return (
		<main className="full-page-loading" aria-busy="true" aria-label="Checking your session">
			<Zap className="loading-mark" fill="currentColor" />
			<p>Checking session…</p>
		</main>
	);
}

export function RequireAuth({ children }: { children: ReactNode }) {
	const sessionQuery = useSessionQuery();
	const authenticated = sessionQuery.data?.authenticated ?? false;

	useEffect(() => {
		if (!sessionQuery.isPending && !authenticated) {
			navigate("/login", { replace: true });
		}
	}, [sessionQuery.isPending, authenticated]);

	if (sessionQuery.isPending) return <FullPageLoading />;
	if (!authenticated) return null;
	return <>{children}</>;
}
