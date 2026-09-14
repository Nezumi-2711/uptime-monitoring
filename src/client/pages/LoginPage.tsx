import { type FormEvent, useEffect, useState } from 'react';
import { Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ThemeToggle } from '../components/ThemeToggle';
import { navigate } from '../lib/router';
import { useSeo } from '../lib/seo';
import { useLoginMutation, useSessionQuery } from '../queries/auth';

export function LoginPage() {
	const [password, setPassword] = useState('');
	const sessionQuery = useSessionQuery();
	const loginMutation = useLoginMutation();
	useSeo({ title: 'Sign in — upwatch', noindex: true });

	useEffect(() => {
		if (sessionQuery.data?.authenticated) navigate('/dashboard', { replace: true });
	}, [sessionQuery.data?.authenticated]);

	function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		loginMutation.mutate({ password }, { onSuccess: () => navigate('/dashboard', { replace: true }) });
	}

	const errorMessage = loginMutation.error instanceof Error ? loginMutation.error.message : 'Unable to sign in';

	return (
		<main className="relative grid min-h-dvh grid-rows-[auto_1fr_auto] justify-items-center bg-[radial-gradient(circle_at_50%_38%,rgb(62_207_142/0.08),transparent_34%),linear-gradient(#fff,#fcfcfc)] p-6 pt-8 pb-6 transition-[background,color] duration-250 ease-out max-compact:px-4 max-compact:py-6 dark:bg-[radial-gradient(ellipse_75%_55%_at_50%_30%,rgba(62,207,142,0.12),transparent_65%),radial-gradient(ellipse_40%_30%_at_50%_12%,rgba(36,180,126,0.07),transparent_50%),linear-gradient(180deg,#0c0e10_0%,#070809_100%)]">
			<ThemeToggle className="absolute top-7 right-7 z-1 text-icon-muted transition-[color,background-color,border-color] duration-150 hover:bg-brand/10 hover:text-brand-deep dark:rounded-lg dark:border dark:border-white/8 dark:bg-white/3 dark:text-gray-400 dark:backdrop-blur-md dark:hover:border-brand/25 dark:hover:bg-brand/10 dark:hover:text-brand" />
			<div
				className="relative z-1 inline-flex items-center gap-2 text-brand-title font-semibold tracking-brand text-brand dark:text-white"
				aria-label="Upwatch"
			>
				<Zap className="size-6.5 text-brand-deep dark:text-brand dark:drop-shadow-brand-glow" fill="currentColor" />
				<span>upwatch</span>
			</div>

			<Card asChild>
				<section
					className="relative z-1 w-[min(100%,420px)] self-center rounded-xl border border-hairline bg-white/96 p-9 shadow-card-elevated animate-enter max-compact:px-5.5 max-compact:py-7 dark:border-white/8 dark:bg-night-card/82 dark:shadow-[0_0_0_1px_rgba(255,255,255,0.05),0_24px_64px_-12px_rgba(0,0,0,0.8),0_0_45px_-10px_rgba(62,207,142,0.08),inset_0_1px_0_0_rgba(255,255,255,0.06)] dark:backdrop-blur-[20px]"
					aria-labelledby="login-title"
				>
					<div>
						<p className="m-0 mb-3 font-mono text-2xs font-medium leading-overline tracking-overline uppercase text-brand-muted dark:text-brand">
							Admin access
						</p>
						<h1
							id="login-title"
							className="m-0 text-title font-medium leading-title tracking-title max-compact:text-title-compact dark:text-gray-50"
						>
							Sign in to Upwatch
						</h1>
						<span className="mt-3 block text-subtitle leading-subtitle text-ink-subtle dark:text-gray-400">
							Enter the admin password to manage your monitors.
						</span>
					</div>

					<form className="mt-7.5 grid gap-5" onSubmit={handleSubmit}>
						<div className="grid gap-2">
							<label htmlFor="password" className="text-caption font-medium text-ink-label dark:text-gray-300">
								Password
							</label>
							<Input
								id="password"
								type="password"
								autoComplete="current-password"
								value={password}
								onChange={(event) => setPassword(event.target.value)}
								minLength={8}
								required
								className="transition-[border-color,box-shadow] duration-150 dark:bg-night-input/85 dark:text-gray-50 dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.4)] dark:hover:border-white/24 dark:focus-visible:border-brand dark:focus-visible:shadow-[0_0_0_3px_rgba(62,207,142,0.2),inset_0_1px_2px_rgba(0,0,0,0.4)]"
							/>
						</div>

						{loginMutation.isError && (
							<p
								className="-mt-1 rounded-sm border border-error-border bg-error-bg px-3 py-2.5 text-micro leading-alert text-error-text dark:border-red-500/28 dark:bg-red-500/12 dark:text-red-300"
								role="alert"
							>
								{errorMessage}
							</p>
						)}

						<Button variant="brand" size="xl" className="w-full" type="submit" disabled={loginMutation.isPending}>
							{loginMutation.isPending ? 'Signing in…' : 'Sign in'}
						</Button>
					</form>
				</section>
			</Card>

			<p className="relative z-1 m-0 text-footnote text-ink-footnote dark:text-faint">Protected by an encrypted, seven-day session.</p>
		</main>
	);
}
