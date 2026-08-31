export function formatDate(value: string) {
	return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

export function formatDuration(ms: number | null, startedAt: string) {
	const duration = ms ?? Math.max(0, Date.now() - new Date(startedAt).getTime());
	if (duration < 60_000) return `${Math.max(1, Math.round(duration / 1000))} sec`;
	if (duration < 3_600_000) return `${Math.round(duration / 60_000)} min`;
	if (duration < 86_400_000) return `${Math.round(duration / 3_600_000)} hr`;
	return `${Math.round(duration / 86_400_000)} days`;
}
