import { Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { navigate } from '../../lib/router';
import { useLogoutMutation } from '../../queries/auth';

export function DashboardHeader() {
	const logoutMutation = useLogoutMutation();

	return (
		<header className="dashboard-header">
			<div className="dashboard-header-inner">
				<a className="brand" href="/dashboard" aria-label="Upwatch dashboard">
					<Zap className="brand-mark" fill="currentColor" />
					<span>upwatch</span>
				</a>
				<div className="nav-actions">
					<span className="header-context">Production monitors</span>
					<a className="nav-auth" href="/">
						View status page
					</a>
					<Button variant="unstyled" className="nav-auth" type="button" onClick={() => navigate('/settings')}>
						Settings
					</Button>
					<Button
						variant="unstyled"
						className="nav-auth"
						type="button"
						onClick={() => logoutMutation.mutate()}
						disabled={logoutMutation.isPending}
					>
						{logoutMutation.isPending ? 'Signing out…' : 'Sign out'}
					</Button>
				</div>
			</div>
		</header>
	);
}
