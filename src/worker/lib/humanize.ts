import type { CheckResult, Monitor } from '../checks/run-check';

export function humanizeInterval(seconds: number): string {
	if (seconds >= 3600 && seconds % 3600 === 0) return `${seconds / 3600} h`;
	if (seconds >= 60 && seconds % 60 === 0) return `${seconds / 60} min`;
	return `${seconds} s`;
}

export function humanizeDuration(ms: number): string {
	const minutes = Math.round(ms / 60_000);
	if (minutes < 1) return 'under a minute';
	if (minutes < 60) return `${minutes} min`;
	const hours = Math.floor(minutes / 60);
	const rest = minutes % 60;
	return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

export function classifyFailure(monitor: Pick<Monitor, 'expectedStatus'>, result: CheckResult): string {
	if (result.statusCode === null) {
		const error = (result.error ?? '').toLowerCase();
		if (/tim(?:e|ed)\s?out|timeout|deadline|aborted/.test(error))
			return 'Request timed out - no response came back before the timeout limit';
		if (/getaddrinfo|enotfound|dns|name not resolved|could not resolve|eai_again/.test(error)) {
			return 'DNS lookup failed - the hostname could not be resolved to an address';
		}
		if (/certificate|cert(?:\s|_)|self[- ]signed|tls|ssl|handshake|err_cert/.test(error)) {
			return 'TLS/SSL failure - the certificate is invalid, expired, or untrusted';
		}
		if (/econnrefused|connection refused|refused to connect/.test(error)) {
			return 'Connection refused - nothing is accepting connections at that address';
		}
		if (/econnreset|connection reset|socket hang up|premature close/.test(error))
			return 'Connection dropped before any response was returned';
		if (/ehostunreach|enetunreach|network is unreachable|no route to host/.test(error)) {
			return 'Network unreachable - the host could not be contacted at all';
		}
		return 'No HTTP response was received from the endpoint';
	}

	const code = result.statusCode;
	if (code >= 500) return `Server error - the endpoint answered with HTTP ${code}`;
	if (code === 429) return 'The endpoint is rate limiting - HTTP 429 Too Many Requests';
	if (code === 401 || code === 403) return `The endpoint rejected the health check as unauthorized - HTTP ${code}`;
	if (code === 404) return 'The health-check path returned HTTP 404 Not Found';
	if (code >= 400) return `Client error - the endpoint answered with HTTP ${code}`;
	if (code >= 300) return `Unexpected redirect - the endpoint answered with HTTP ${code}`;
	return `The endpoint answered with HTTP ${code}, but HTTP ${monitor.expectedStatus} was expected`;
}
