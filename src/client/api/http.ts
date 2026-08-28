export class ApiError extends Error {
	constructor(
		message: string,
		readonly status: number,
	) {
		super(message);
		this.name = "ApiError";
	}
}

async function getErrorMessage(response: Response) {
	try {
		const body = await response.json<{ message?: unknown }>();
		if (typeof body.message === "string" && body.message.length > 0) {
			return body.message;
		}
	} catch {
		// Fall back to the HTTP status when the response is not JSON.
	}

	return `Request returned HTTP ${response.status}`;
}

export async function getJson<T>(
	input: RequestInfo | URL,
	init: RequestInit = {},
): Promise<T> {
	const headers = new Headers(init.headers);
	headers.set("Accept", "application/json");

	const response = await fetch(input, {
		...init,
		headers,
	});

	if (!response.ok) {
		throw new ApiError(await getErrorMessage(response), response.status);
	}

	return response.json() as Promise<T>;
}

function sendJson<T>(
	method: "POST" | "PUT" | "PATCH" | "DELETE",
	input: RequestInfo | URL,
	body?: unknown,
	init: RequestInit = {},
) {
	const headers = new Headers(init.headers);
	headers.set("Content-Type", "application/json");

	return getJson<T>(input, {
		...init,
		method,
		headers,
		credentials: "same-origin",
		body: body === undefined ? undefined : JSON.stringify(body),
	});
}

export function postJson<T>(
	input: RequestInfo | URL,
	body?: unknown,
	init: RequestInit = {},
) {
	return sendJson<T>("POST", input, body, init);
}

export function patchJson<T>(
	input: RequestInfo | URL,
	body?: unknown,
	init: RequestInit = {},
) {
	return sendJson<T>("PATCH", input, body, init);
}

export function putJson<T>(
	input: RequestInfo | URL,
	body?: unknown,
	init: RequestInit = {},
) {
	return sendJson<T>("PUT", input, body, init);
}

export function deleteJson<T>(
	input: RequestInfo | URL,
	init: RequestInit = {},
) {
	return sendJson<T>("DELETE", input, undefined, init);
}
