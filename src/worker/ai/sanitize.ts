export type SanitizeReason = 'contains_url' | 'contains_ip' | 'contains_http_status' | 'empty';

export function sanitizePublicTextWithReason(value: string, maxLength: number): { text: string | null; reason: SanitizeReason | null } {
	const message = value
		.replace(/\r/g, '')
		.trim()
		.replace(/^(?:message|update|status|title|body)\s*:\s*/i, '')
		.replace(/^(["'])([\s\S]*)\1$/, '$2')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, maxLength);
	if (!message) return { text: null, reason: 'empty' };
	if (/https?:\/\//i.test(message)) return { text: null, reason: 'contains_url' };
	if (/\b(?:\d{1,3}\.){3}\d{1,3}\b/.test(message)) return { text: null, reason: 'contains_ip' };
	if (/\bHTTP[\s/]?\d{3}\b/i.test(message) || /\b[45]\d{2}\s+(?:error|status|response)\b/i.test(message)) {
		return { text: null, reason: 'contains_http_status' };
	}
	return { text: message, reason: null };
}

export function sanitizePublicText(value: string, maxLength: number): string | null {
	return sanitizePublicTextWithReason(value, maxLength).text;
}
