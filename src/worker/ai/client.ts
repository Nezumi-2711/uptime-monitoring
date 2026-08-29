export type CompletionSettings = {
	baseUrl: string;
	apiKey: string;
	model: string;
};

type CompletionBody = {
	choices?: Array<{ message?: { content?: unknown } }>;
};

export async function requestCompletion(settings: CompletionSettings, system: string, user: string): Promise<string | null> {
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
				max_tokens: 160,
				temperature: 0.2,
			}),
			signal: AbortSignal.timeout(10_000),
		});
		if (!response.ok) {
			await response.body?.cancel();
			console.warn(JSON.stringify({ message: 'AI completion returned an error', status: response.status }));
			return null;
		}

		const body = (await response.json()) as CompletionBody;
		const content = body.choices?.[0]?.message?.content;
		if (typeof content !== 'string') {
			console.warn(JSON.stringify({ message: 'AI completion returned malformed content' }));
			return null;
		}
		return content;
	} catch (error) {
		console.warn(
			JSON.stringify({
				message: 'AI completion failed',
				error: error instanceof Error ? error.message : String(error),
			}),
		);
		return null;
	}
}
