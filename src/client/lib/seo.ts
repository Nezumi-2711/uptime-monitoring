import { useEffect } from 'react';

type SeoOptions = {
	title: string;
	description?: string;
	noindex?: boolean;
	canonicalPath?: string;
};

const managedAttribute = 'data-upwatch-seo';
const defaultDescription = "Fast, dependable uptime monitoring from Cloudflare's edge.";

function upsertMeta(selector: string, attributes: Record<string, string>, content: string) {
	let element = document.head.querySelector<HTMLMetaElement>(selector);
	if (!element) {
		element = document.createElement('meta');
		for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
		document.head.appendChild(element);
	}
	element.setAttribute('content', content);
	element.setAttribute(managedAttribute, 'true');
}

function removeManaged(selector: string) {
	document.head.querySelector(`${selector}[${managedAttribute}="true"]`)?.remove();
}

function removeNoindex() {
	const robots = document.head.querySelector<HTMLMetaElement>('meta[name="robots"]');
	if (robots?.content.includes('noindex')) robots.remove();
}

function absoluteUrl(pathname: string) {
	const configuredBase = import.meta.env.VITE_PUBLIC_BASE_URL?.replace(/\/$/, '');
	return new URL(pathname, configuredBase || window.location.origin).toString();
}

export function useSeo({ title, description, noindex = false, canonicalPath }: SeoOptions) {
	useEffect(() => {
		const resolvedDescription = description ?? defaultDescription;
		document.title = title;
		upsertMeta('meta[property="og:title"]', { property: 'og:title' }, title);
		upsertMeta('meta[name="twitter:title"]', { name: 'twitter:title' }, title);
		upsertMeta('meta[name="description"]', { name: 'description' }, resolvedDescription);
		upsertMeta('meta[property="og:description"]', { property: 'og:description' }, resolvedDescription);
		upsertMeta('meta[name="twitter:description"]', { name: 'twitter:description' }, resolvedDescription);

		if (noindex) upsertMeta('meta[name="robots"]', { name: 'robots' }, 'noindex,nofollow');
		else removeNoindex();

		if (canonicalPath) {
			let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
			if (!canonical) {
				canonical = document.createElement('link');
				canonical.rel = 'canonical';
				document.head.appendChild(canonical);
			}
			canonical.href = absoluteUrl(canonicalPath);
			canonical.setAttribute(managedAttribute, 'true');
		} else removeManaged('link[rel="canonical"]');
	}, [canonicalPath, description, noindex, title]);
}
