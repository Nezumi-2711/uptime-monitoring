import { useHealthQuery } from "./queries/health";
import { navigate, usePathname } from "./lib/router";
import { LoginPage } from "./pages/LoginPage";
import { useLogoutMutation, useSessionQuery } from "./queries/auth";

type IconProps = {
	className?: string;
};

function LogoMark({ className }: IconProps) {
	return (
		<svg className={className} viewBox="0 0 32 32" aria-hidden="true">
			<path d="M17.55 2.42 6.1 17.06c-.6.77-.06 1.9.92 1.9h9.22l-1.08 10.16c-.13 1.2 1.4 1.78 2.08.78L28 14.09c.52-.77-.03-1.81-.96-1.81h-8.56l1.14-8.95c.14-1.14-1.36-1.82-2.07-.91Z" fill="currentColor" />
		</svg>
	);
}

function ArrowIcon({ className }: IconProps) {
	return (
		<svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden="true">
			<path d="M3 8h9.5m-3.25-3.5L12.75 8l-3.5 3.5" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	);
}

function RefreshIcon({ className }: IconProps) {
	return (
		<svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden="true">
			<path d="M13 5.5V2.75m0 0h-2.75M13 2.75A6 6 0 1 0 14 9" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	);
}

function DatabaseIcon({ className }: IconProps) {
	return (
		<svg className={className} viewBox="0 0 18 18" fill="none" aria-hidden="true">
			<ellipse cx="9" cy="4" rx="5.75" ry="2.25" stroke="currentColor" strokeWidth="1.3" />
			<path d="M3.25 4v5.1c0 1.25 2.57 2.27 5.75 2.27s5.75-1.02 5.75-2.27V4M3.25 9.1v4.9c0 1.24 2.57 2.25 5.75 2.25s5.75-1.01 5.75-2.25V9.1" stroke="currentColor" strokeWidth="1.3" />
		</svg>
	);
}

function WorkerIcon({ className }: IconProps) {
	return (
		<svg className={className} viewBox="0 0 18 18" fill="none" aria-hidden="true">
			<path d="M9 1.75 2.75 5.38v7.24L9 16.25l6.25-3.63V5.38L9 1.75Z" stroke="currentColor" strokeWidth="1.3" />
			<path d="m6.5 9 1.6 1.6L11.75 7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	);
}

function formatCheckedAt(timestamp: number) {
	return new Intl.DateTimeFormat("en", {
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	}).format(new Date(timestamp));
}

export function LandingPage() {
	const { data: health, error, isError, isFetching, isPending, refetch } = useHealthQuery();
	const sessionQuery = useSessionQuery();
	const logoutMutation = useLogoutMutation();
	const hasHealth = health !== undefined;
	const isHealthy = hasHealth && health.ok && health.db?.ok === 1;
	const statusLabel = isPending ? "Checking" : isHealthy ? "Operational" : "Degraded";
	const errorMessage = error instanceof Error ? error.message : "Unknown request error";

	return (
		<div className="site-shell">
			<header className="site-header">
				<nav className="nav-container" aria-label="Main navigation">
					<a className="brand" href="#top" aria-label="Upwatch home">
						<LogoMark className="brand-mark" />
						<span>upwatch</span>
					</a>

					<div className="nav-links">
						<a href="#platform">Platform</a>
						<a href="#infrastructure">Infrastructure</a>
						<a href="#status">Status</a>
					</div>

					<div className="nav-actions">
						{sessionQuery.data?.authenticated ? (
							<button
								className="nav-auth"
								type="button"
								onClick={() => logoutMutation.mutate()}
								disabled={logoutMutation.isPending}
							>
								{logoutMutation.isPending ? "Signing out…" : "Sign out"}
							</button>
						) : (
							<a className="nav-auth" href="/login" onClick={(event) => {
								event.preventDefault();
								navigate("/login");
							}}>Sign in</a>
						)}
						<a className="nav-cta" href="#status">
							View live status
							<ArrowIcon />
						</a>
					</div>
				</nav>
			</header>

			<main id="top">
				<section className="hero" id="platform">
					<div className="hero-copy">
						<div className="announcement">
							<span>Live</span>
							Monitoring from Cloudflare's edge
							<ArrowIcon />
						</div>

						<h1>Uptime monitoring<br />that stays out of the way.</h1>
						<p className="hero-lead">
							Fast, dependable checks for every service you run. See what is healthy,
							catch what is not, and get back to building.
						</p>

						<div className="hero-actions">
							<a className="primary-button" href="#status">
								Explore live status
								<ArrowIcon />
							</a>
							<a className="text-link" href="#infrastructure">See how it works</a>
						</div>

						<div className="trust-note">
							<span className="trust-avatars" aria-hidden="true">
								<i>CF</i><i>D1</i><i>5m</i>
							</span>
							<p><strong>Edge-native by design.</strong><br />Worker, D1, and scheduled checks in one stack.</p>
						</div>
					</div>

					<div className="product-stage" id="status">
						<div className="dashboard-window">
							<div className="window-bar">
								<div className="window-brand"><LogoMark /> <span>upwatch</span></div>
								<div className="window-project"><span className="project-dot" /> Production <span className="chevron">⌄</span></div>
								<button className="icon-button" type="button" onClick={() => void refetch()} aria-label="Refresh health check" disabled={isFetching}>
									<RefreshIcon className={isFetching ? "is-spinning" : ""} />
								</button>
							</div>

							<div className="dashboard-layout">
								<aside className="dashboard-sidebar" aria-label="Dashboard sections">
									<div className="sidebar-icon active"><span className="grid-icon" /></div>
									<div className="sidebar-icon"><DatabaseIcon /></div>
									<div className="sidebar-icon"><span className="pulse-icon" /></div>
								</aside>

								<div className="dashboard-content">
									<div className="dashboard-heading">
										<div>
											<p className="overline">Project health</p>
											<h2>Infrastructure</h2>
										</div>
										<span className={`health-badge ${isHealthy ? "healthy" : isPending ? "pending" : "unhealthy"}`} aria-live="polite">
											<span />{statusLabel}
										</span>
									</div>

									<div className="metric-grid">
										<div className="metric-card">
											<p>System status</p>
											<strong>{isPending ? "—" : isHealthy ? "100%" : "0%"}</strong>
											<span>Current availability</span>
										</div>
										<div className="metric-card chart-card">
											<p>Checks</p>
											<strong>Every 5 min</strong>
											<div className="mini-bars" aria-hidden="true">
												{[42, 55, 48, 70, 62, 82, 76, 92, 88, 100].map((height, index) => <i key={index} style={{ height: `${height}%` }} />)}
											</div>
										</div>
									</div>

									<div className="services-panel" id="infrastructure">
										<div className="services-title"><span>Services</span><span>Response</span><span>Status</span></div>
										<div className="service-row">
											<div className="service-name"><span className="service-icon"><WorkerIcon /></span><div><strong>Edge Worker</strong><small>/api/health</small></div></div>
											<code>{isPending ? "checking" : hasHealth ? "200 OK" : "failed"}</code>
											<span className={`row-status ${isPending ? "checking" : hasHealth ? "online" : "offline"}`}><i />{isPending ? "Checking" : hasHealth ? "Online" : "Offline"}</span>
										</div>
										<div className="service-row">
											<div className="service-name"><span className="service-icon"><DatabaseIcon /></span><div><strong>D1 Database</strong><small>uptime / sqlite</small></div></div>
											<code>{isPending ? "checking" : hasHealth ? `ok: ${health.db?.ok ?? 0}` : "unreachable"}</code>
											<span className={`row-status ${isPending ? "checking" : isHealthy ? "online" : "offline"}`}><i />{isPending ? "Checking" : isHealthy ? "Online" : "Offline"}</span>
										</div>
									</div>

									<div className="dashboard-footer">
										<span>{hasHealth ? `Last checked at ${formatCheckedAt(health.ts)}` : isError ? errorMessage : "Running health check…"}</span>
										<button type="button" onClick={() => void refetch()} disabled={isFetching}>Run check <ArrowIcon /></button>
									</div>
								</div>
							</div>
						</div>

						<div className="floating-log" aria-hidden="true">
							<div><span className="log-dot" /> Live events <small>just now</small></div>
							<code><em>GET</em> /api/health <strong>{isError && !hasHealth ? "ERR" : "200"}</strong></code>
						</div>
					</div>
				</section>
			</main>

			<footer className="site-footer">
				<p>Built on Cloudflare Workers and D1.</p>
				<div><span><i className={isHealthy ? "footer-dot healthy" : "footer-dot"} /> {statusLabel}</span><span>© 2026 Upwatch</span></div>
			</footer>
		</div>
	);
}

function App() {
	const pathname = usePathname();
	return pathname === "/login" ? <LoginPage /> : <LandingPage />;
}

export default App;
