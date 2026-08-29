import { Activity, LogOut, Menu, Settings, Zap, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { navigate, usePathname } from '../lib/router';
import { useLogoutMutation } from '../queries/auth';

type NavigationItem = {
	label: string;
	icon: LucideIcon;
	href?: string;
	onClick: () => void;
	disabled?: boolean;
};

export function AppHeader({ context }: { context?: string }) {
	const pathname = usePathname();
	const logoutMutation = useLogoutMutation();
	const items: NavigationItem[] = [
		{
			label: 'View status page',
			icon: Activity,
			href: '/',
			onClick: () => navigate('/'),
		},
		{
			label: 'Settings',
			icon: Settings,
			href: '/settings',
			onClick: () => navigate('/settings'),
		},
		{
			label: logoutMutation.isPending ? 'Signing out…' : 'Sign out',
			icon: LogOut,
			onClick: () => logoutMutation.mutate(),
			disabled: logoutMutation.isPending,
		},
	];

	return (
		<header className="dashboard-header">
			<div className="dashboard-header-inner">
				<Button
					variant="unstyled"
					className="brand brand-button"
					type="button"
					onClick={() => navigate('/dashboard')}
					aria-label="Upwatch dashboard"
				>
					<Zap className="brand-mark" fill="currentColor" aria-hidden="true" />
					<span>upwatch</span>
				</Button>

				<nav className="nav-actions" aria-label="Primary navigation">
					{context && <span className="header-context">{context}</span>}
					{items.map((item) => {
						const ItemIcon = item.icon;
						const isCurrent = item.href === pathname;

						return (
							<Tooltip key={item.label}>
								<TooltipTrigger asChild>
									<Button
										variant="ghost"
										size="icon"
										className="app-nav-icon"
										type="button"
										aria-label={item.label}
										aria-current={isCurrent ? 'page' : undefined}
										disabled={item.disabled}
										onClick={item.onClick}
									>
										<ItemIcon aria-hidden="true" />
									</Button>
								</TooltipTrigger>
								<TooltipContent sideOffset={6}>{item.label}</TooltipContent>
							</Tooltip>
						);
					})}
				</nav>

				<div className="app-nav-mobile-trigger">
					<Sheet>
						<SheetTrigger asChild>
							<Button variant="ghost" size="icon" type="button" aria-label="Open menu">
								<Menu aria-hidden="true" />
							</Button>
						</SheetTrigger>
						<SheetContent side="right" className="app-nav-sheet">
							<SheetHeader className="app-nav-sheet-header">
								<SheetTitle className="app-nav-sheet-title">
									<Zap fill="currentColor" aria-hidden="true" />
									<span>upwatch</span>
								</SheetTitle>
								{context && <SheetDescription>{context}</SheetDescription>}
							</SheetHeader>
							<nav className="app-nav-mobile" aria-label="Primary navigation">
								{items.map((item) => {
									const ItemIcon = item.icon;
									const isCurrent = item.href === pathname;

									return (
										<SheetClose asChild key={item.label}>
											<button
												className="app-nav-mobile-item"
												type="button"
												aria-current={isCurrent ? 'page' : undefined}
												disabled={item.disabled}
												onClick={item.onClick}
											>
												<ItemIcon aria-hidden="true" />
												<span>{item.label}</span>
											</button>
										</SheetClose>
									);
								})}
							</nav>
						</SheetContent>
					</Sheet>
				</div>
			</div>
		</header>
	);
}
