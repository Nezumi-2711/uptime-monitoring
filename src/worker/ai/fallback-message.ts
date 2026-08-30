/** Appended to every visitor-facing incident message so the update always closes with reassurance. */
export const INCIDENT_REASSURANCE =
	'The problem was detected automatically, our team has been alerted, and we are working to restore normal service as soon as possible.';

export const RECOVERY_UPDATE_BODY = 'The service has recovered and is responding normally again.';

/** Plain-language, non-technical description of the impact, used when no AI message is available. */
export function describeFailure(statusCode: number | null): string {
	if (statusCode === null) return 'This service is currently unreachable and may not load for visitors.';
	if (statusCode >= 500 && statusCode <= 599) return 'This service is having problems and some requests may fail or load incorrectly.';
	if (statusCode === 429) return 'This service is under heavy load and is temporarily turning away some requests.';
	if (statusCode >= 400 && statusCode <= 499) return 'This service is not responding correctly and some features may not work right now.';
	if (statusCode >= 300 && statusCode <= 399) return 'This service is not loading as expected for visitors.';
	return 'This service is not responding as expected and may be unavailable.';
}

/** The deterministic public message shown when AI copy is disabled or generation fails. */
export function deterministicIncidentMessage(statusCode: number | null): string {
	return `${describeFailure(statusCode)} ${INCIDENT_REASSURANCE}`;
}
