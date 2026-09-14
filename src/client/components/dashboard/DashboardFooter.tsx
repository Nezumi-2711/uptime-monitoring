export function DashboardFooter() {
	return (
		<footer className="mx-auto flex w-[min(1280px,calc(100%-48px))] max-[760px]:w-[min(1280px,calc(100%-32px))] flex-col gap-2 md:flex-row md:gap-0 justify-between border-t border-border-row py-6 pb-8 text-micro text-ink-subtle-2 dark:border-white/8 dark:text-faint">
			<span>Cloudflare Workers + D1</span>
			<span>Automatic refresh every minute</span>
		</footer>
	);
}
