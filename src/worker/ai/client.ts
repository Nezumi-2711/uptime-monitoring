export type CompletionSettings = {
	baseUrl: string;
	apiKey: string;
	model: string;
};

type CompletionBody = {
	choices?: Array<{ message?: { content?: unknown } }>;
	usage?: { prompt_tokens?: number; completion_tokens?: number };
};

export type CompletionResult = {
	content: string | null;
	latencyMs: number;
	promptTokens: number | null;
	completionTokens: number | null;
	failure: string | null;
};

function failureMessage(error: unknown): string {
	if (error instanceof DOMException && error.name === 'TimeoutError') return 'timeout';
	return (error instanceof Error ? error.message : String(error)).slice(0, 200);
}

export async function requestCompletionDetailed(
	settings: CompletionSettings,
	system: string,
	user: string,
	maxTokens = 160,
): Promise<CompletionResult> {
	const startedAt = Date.now();
	try {
		const response = await fetch(`${settings.baseUrl}/chat/completions`, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${settings.apiKey}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				model: settings.model,
				messages: [
					{ role: 'system', content: system },
					{ role: 'user', content: user },
				],
				max_tokens: maxTokens,
				temperature: 0.2,
			}),
			signal: AbortSignal.timeout(10_000),
		});
		if (!response.ok) {
			await response.body?.cancel();
			console.warn(JSON.stringify({ message: 'AI completion returned an error', status: response.status }));
			return {
				content: null,
				latencyMs: Date.now() - startedAt,
				promptTokens: null,
				completionTokens: null,
				failure: `http_${response.status}`,
			};
		}

		const body = (await response.json()) as CompletionBody;
		const content = body.choices?.[0]?.message?.content;
		if (typeof content !== 'string') {
			console.warn(JSON.stringify({ message: 'AI completion returned malformed content' }));
			return {
				content: null,
				latencyMs: Date.now() - startedAt,
				promptTokens: body.usage?.prompt_tokens ?? null,
				completionTokens: body.usage?.completion_tokens ?? null,
				failure: 'malformed',
			};
		}
		return {
			content,
			latencyMs: Date.now() - startedAt,
			promptTokens: body.usage?.prompt_tokens ?? null,
			completionTokens: body.usage?.completion_tokens ?? null,
			failure: null,
		};
	} catch (error) {
		const failure = failureMessage(error);
		console.warn(JSON.stringify({ message: 'AI completion failed', error: failure }));
		return {
			content: null,
			latencyMs: Date.now() - startedAt,
			promptTokens: null,
			completionTokens: null,
			failure,
		};
	}
}

export async function requestCompletion(
	settings: CompletionSettings,
	system: string,
	user: string,
	maxTokens = 160,
): Promise<string | null> {
	return (await requestCompletionDetailed(settings, system, user, maxTokens)).content;
}
