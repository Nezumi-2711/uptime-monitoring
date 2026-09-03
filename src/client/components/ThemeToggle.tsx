import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useTheme } from '../lib/theme';

type ThemeToggleProps = {
	className?: string;
	showLabel?: boolean;
};

export function ThemeToggle({ className = '', showLabel = false }: ThemeToggleProps) {
	const { theme, toggleTheme } = useTheme();
	const isDark = theme === 'dark';
	const label = isDark ? 'Switch to light mode' : 'Switch to dark mode';
	const Icon = isDark ? Sun : Moon;

	if (showLabel) {
		return (
			<Button variant="unstyled" className={className} type="button" onClick={toggleTheme} aria-label={label}>
				<Icon aria-hidden="true" />
				<span>{label}</span>
			</Button>
		);
	}

	return (
		<TooltipProvider>
			<Tooltip>
				<TooltipTrigger asChild>
					<Button variant="ghost" size="icon" className={className} type="button" onClick={toggleTheme} aria-label={label}>
						<Icon aria-hidden="true" />
					</Button>
				</TooltipTrigger>
				<TooltipContent sideOffset={6}>{label}</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
}
