import { getJson, postJson } from "./http";

export type AuthUser = {
	id: string;
	email: string;
};

export type SessionResponse = {
	user: AuthUser | null;
};

export type LoginInput = {
	email: string;
	password: string;
};

export function getSession(signal?: AbortSignal) {
	return getJson<SessionResponse>("/api/auth/me", {
		signal,
		credentials: "same-origin",
	});
}

export function login(input: LoginInput) {
	return postJson<SessionResponse>("/api/auth/login", input);
}

export function logout() {
	return postJson<{ ok: true }>("/api/auth/logout");
}
