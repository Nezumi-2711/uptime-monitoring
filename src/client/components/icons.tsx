type IconProps = {
	className?: string;
};

export function LogoMark({ className }: IconProps) {
	return (
		<svg className={className} viewBox="0 0 32 32" aria-hidden="true">
			<path d="M17.55 2.42 6.1 17.06c-.6.77-.06 1.9.92 1.9h9.22l-1.08 10.16c-.13 1.2 1.4 1.78 2.08.78L28 14.09c.52-.77-.03-1.81-.96-1.81h-8.56l1.14-8.95c.14-1.14-1.36-1.82-2.07-.91Z" fill="currentColor" />
		</svg>
	);
}

export function ArrowIcon({ className }: IconProps) {
	return (
		<svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden="true">
			<path d="M3 8h9.5m-3.25-3.5L12.75 8l-3.5 3.5" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	);
}

export function RefreshIcon({ className }: IconProps) {
	return (
		<svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden="true">
			<path d="M13 5.5V2.75m0 0h-2.75M13 2.75A6 6 0 1 0 14 9" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	);
}

export function DatabaseIcon({ className }: IconProps) {
	return (
		<svg className={className} viewBox="0 0 18 18" fill="none" aria-hidden="true">
			<ellipse cx="9" cy="4" rx="5.75" ry="2.25" stroke="currentColor" strokeWidth="1.3" />
			<path d="M3.25 4v5.1c0 1.25 2.57 2.27 5.75 2.27s5.75-1.02 5.75-2.27V4M3.25 9.1v4.9c0 1.24 2.57 2.25 5.75 2.25s5.75-1.01 5.75-2.25V9.1" stroke="currentColor" strokeWidth="1.3" />
		</svg>
	);
}
