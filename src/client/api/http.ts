export class ApiError extends Error {
	constructor(
		message: string,
		readonly status: number,
	) {
		super(message);
		this.name = "ApiError";
	}
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
		throw new ApiError(
		`Request returned HTTP ${response.status}`,
		response.status,
		);
	}

	return response.json() as Promise<T>;
}
