import { type FormEvent, useEffect, useState } from 'react';
import { Zap } from 'lucide-react';
import { navigate } from '../lib/router';
import { useLoginMutation, useSessionQuery } from '../queries/auth';

export function LoginPage() {
	const [password, setPassword] = useState('');
	const sessionQuery = useSessionQuery();
	const loginMutation = useLoginMutation();

	useEffect(() => {
		if (sessionQuery.data?.authenticated) navigate('/dashboard', { replace: true });
	}, [sessionQuery.data?.authenticated]);

	function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		loginMutation.mutate({ password }, { onSuccess: () => navigate('/dashboard', { replace: true }) });
	}

	const errorMessage = loginMutation.error instanceof Error ? loginMutation.error.message : 'Unable to sign in';

	return (
		<main className="auth-page">
			<div className="auth-brand" aria-label="Upwatch">
				<Zap className="auth-brand-mark" fill="currentColor" />
				<span>upwatch</span>
			</div>

			<section className="auth-card" aria-labelledby="login-title">
				<div className="auth-heading">
					<p>Admin access</p>
					<h1 id="login-title">Sign in to Upwatch</h1>
					<span>Enter the admin password to manage your monitors.</span>
				</div>

				<form className="auth-form" onSubmit={handleSubmit}>
					<div className="auth-field">
						<label htmlFor="password">Password</label>
						<input
							id="password"
							type="password"
							autoComplete="current-password"
							value={password}
							onChange={(event) => setPassword(event.target.value)}
							minLength={8}
							required
						/>
					</div>

					{loginMutation.isError && (
						<p className="auth-error" role="alert">
							{errorMessage}
						</p>
					)}

					<button className="auth-submit" type="submit" disabled={loginMutation.isPending}>
						{loginMutation.isPending ? 'Signing in…' : 'Sign in'}
					</button>
				</form>
			</section>

			<p className="auth-footnote">Protected by an encrypted, seven-day session.</p>
		</main>
	);
}
