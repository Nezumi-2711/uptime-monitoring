import { type FormEvent, useEffect, useState } from "react";
import { navigate } from "../lib/router";
import { useLoginMutation, useSessionQuery } from "../queries/auth";

export function LoginPage() {
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const sessionQuery = useSessionQuery();
	const loginMutation = useLoginMutation();

	useEffect(() => {
		if (sessionQuery.data?.user) navigate("/", { replace: true });
	}, [sessionQuery.data?.user]);

	function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		loginMutation.mutate(
			{ email, password },
			{ onSuccess: () => navigate("/", { replace: true }) },
		);
	}

	const errorMessage = loginMutation.error instanceof Error
		? loginMutation.error.message
		: "Unable to sign in";

	return (
		<main className="auth-page">
			<a className="auth-brand" href="/" onClick={(event) => {
				event.preventDefault();
				navigate("/");
			}} aria-label="Upwatch home">
				<span className="auth-brand-mark" aria-hidden="true">ϟ</span>
				<span>upwatch</span>
			</a>

			<section className="auth-card" aria-labelledby="login-title">
				<div className="auth-heading">
					<p>Admin access</p>
					<h1 id="login-title">Sign in to Upwatch</h1>
					<span>Manage monitors and review incidents from one place.</span>
				</div>

				<form className="auth-form" onSubmit={handleSubmit}>
					<div className="auth-field">
						<label htmlFor="email">Email address</label>
						<input
							id="email"
							type="email"
							autoComplete="email"
							value={email}
							onChange={(event) => setEmail(event.target.value)}
							required
							autoFocus
						/>
					</div>

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
						<p className="auth-error" role="alert">{errorMessage}</p>
					)}

					<button className="auth-submit" type="submit" disabled={loginMutation.isPending}>
						{loginMutation.isPending ? "Signing in…" : "Sign in"}
					</button>
				</form>
			</section>

			<p className="auth-footnote">Protected by an encrypted, seven-day session.</p>
		</main>
	);
}
