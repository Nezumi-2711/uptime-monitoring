export function isPrivateHostname(rawHostname: string): boolean {
	const hostname = rawHostname
		.toLowerCase()
		.replace(/^\[|\]$/g, '')
		.replace(/\.$/, '');
	if (hostname === 'localhost' || hostname.endsWith('.localhost')) return true;

	const ipv4 = hostname.split('.').map(Number);
	if (ipv4.length === 4 && ipv4.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)) {
		const [first, second] = ipv4;
		return (
			first === 0 ||
			first === 10 ||
			first === 127 ||
			(first === 169 && second === 254) ||
			(first === 172 && second >= 16 && second <= 31) ||
			(first === 192 && second === 168)
		);
	}

	if (hostname === '::' || hostname === '::1') return true;
	if (/^f[cd][0-9a-f]{2}(?::|$)/i.test(hostname) || /^fe[89ab][0-9a-f](?::|$)/i.test(hostname)) return true;
	const mappedIpv4 = hostname.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
	return mappedIpv4 ? isPrivateHostname(mappedIpv4[1]) : false;
}

export function isSafeRemoteUrl(url: URL) {
	return (url.protocol === 'http:' || url.protocol === 'https:') && !url.username && !url.password && !isPrivateHostname(url.hostname);
}
