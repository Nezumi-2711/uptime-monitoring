import type { PublicIncident, PublicStatus } from '../../client/api/status';

export type SeoHead = {
	title: string;
	description: string;
	canonical: string;
	image: string;
	robots: string;
};

const STATUS_TITLES: Record<PublicStatus['overall'], string> = {
	operational: 'All systems operational',
	degraded: 'Some systems are degraded',
	down: 'Major service disruption',
};

export function absoluteBase(env: Env, request: Request): string {
	const configured = (env as unknown as { PUBLIC_BASE_URL?: string }).PUBLIC_BASE_URL?.trim().replace(/\/$/, '');
	return configured || new URL(request.url).origin;
}

export function escapeHtml(value: string): string {
	return value.replace(/[&<>"']/g, (character) => {
		if (character === '&') return '&amp;';
		if (character === '<') return '&lt;';
		if (character === '>') return '&gt;';
		if (character === '"') return '&quot;';
		return '&#39;';
	});
}

function cleanDescription(value: string, fallback: string): string {
	const normalized = value.replace(/\s+/g, ' ').trim();
	if (!normalized) return fallback;
	return normalized.length > 200 ? `${normalized.slice(0, 197).trimEnd()}…` : normalized;
}

export function statusHead(status: PublicStatus | null, base: string): SeoHead {
	const title = status ? `${STATUS_TITLES[status.overall]} — upwatch status` : 'Service status — upwatch';
	const description = status
		? `${status.services.length} ${status.services.length === 1 ? 'service' : 'services'} · ${status.services.filter((service) => service.status === 'up').length} operational · ${status.activeIncidents.length} active ${status.activeIncidents.length === 1 ? 'incident' : 'incidents'}`
		: 'Live operational health and 90-day availability for every public service.';
	return { title, description, canonical: `${base}/`, image: `${base}/og.png`, robots: 'index,follow' };
}

export function incidentHead(incident: PublicIncident | null, base: string, id: string): SeoHead {
	if (!incident) {
		return {
			title: 'Incident not found — upwatch status',
			description: 'The requested public incident report could not be found.',
			canonical: `${base}/incidents/${encodeURIComponent(id)}`,
			image: `${base}/og.png`,
			robots: 'noindex,follow',
		};
	}
	const latestUpdate = incident.updates?.at(-1)?.body;
	const services = incident.services.map((service) => service.name).join(', ');
	const fallback = `${services || 'General service incident'} · Started ${new Date(incident.startedAt).toISOString()}`;
	return {
		title: `${incident.title} — ${incident.status} — upwatch status`,
		description: cleanDescription(latestUpdate ?? '', fallback),
		canonical: `${base}/incidents/${incident.id}`,
		image: `${base}/og.png`,
		robots: 'index,follow',
	};
}

export function renderMetaTags(head: SeoHead): string {
	const title = escapeHtml(head.title);
	const description = escapeHtml(head.description);
	const canonical = escapeHtml(head.canonical);
	const image = escapeHtml(head.image);
	const robots = escapeHtml(head.robots);
	return [
		`<meta name="description" content="${description}">`,
		`<meta name="robots" content="${robots}">`,
		`<link rel="canonical" href="${canonical}">`,
		'<meta property="og:type" content="website">',
		'<meta property="og:site_name" content="Upwatch">',
		`<meta property="og:title" content="${title}">`,
		`<meta property="og:description" content="${description}">`,
		`<meta property="og:url" content="${canonical}">`,
		`<meta property="og:image" content="${image}">`,
		'<meta property="og:image:width" content="1200">',
		'<meta property="og:image:height" content="630">',
		'<meta name="twitter:card" content="summary_large_image">',
		`<meta name="twitter:title" content="${title}">`,
		`<meta name="twitter:description" content="${description}">`,
		`<meta name="twitter:image" content="${image}">`,
	].join('');
}
