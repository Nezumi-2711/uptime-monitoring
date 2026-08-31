export const AUTOPILOT_STATUS_GUIDANCE = {
	investigating: 'State that automated monitoring continues to observe the disruption. Do not imply that the cause is known.',
	identified:
		'State only that monitoring has consistently observed the same failure pattern. Do not claim a root cause or human diagnosis.',
	monitoring:
		'State that service responses have recently improved and automated monitoring is checking that recovery remains stable. Do not claim a fix was applied.',
} as const;

const PUBLIC_RULES = [
	'Write for non-technical visitors in calm, factual language.',
	'Never include URLs, hostnames, domains, IP addresses, ports, paths, HTTP status codes, error codes, or stack traces.',
	'Never invent a root cause, a human action, or an estimated recovery time.',
	'Output only the requested fields.',
].join('\n');

export const INCIDENT_OPEN_SYSTEM_PROMPT = [
	'Create a concise public incident title and opening update.',
	'Use exactly this format: TITLE: one short title\nBODY: two short sentences under 240 characters total.',
	PUBLIC_RULES,
].join('\n');

export const INCIDENT_FOLLOWUP_SYSTEM_PROMPT = [
	'Write one short public follow-up update under 240 characters.',
	'Describe only the observed visitor impact and current automated-monitoring state.',
	PUBLIC_RULES,
].join('\n');

export const INCIDENT_RESOLVE_SYSTEM_PROMPT = [
	'Write one short public resolution update under 240 characters.',
	'Say that service has recovered, mention the supplied approximate duration, and say monitoring confirms normal operation.',
	'Do not claim that a fix was applied.',
	PUBLIC_RULES,
].join('\n');
