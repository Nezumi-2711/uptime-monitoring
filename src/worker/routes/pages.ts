import { Hono, type Context } from 'hono';
import type { PublicIncident, PublicStatus } from '../../client/api/status';
import { resolveStatusCacheSeconds } from '../lib/runtime-config';
import { rewriteHead } from '../seo/html';
import { absoluteBase, escapeHtml, incidentHead, statusHead } from '../seo/meta';

type AppFetch = (request: Request, env: Env, executionCtx: Context<{ Bindings: Env }>['executionCtx']) => Response | Promise<Response>;
type EdgeCache = {
	match(request: RequestInfo | URL): Promise<Response | undefined>;
	put(request: RequestInfo | URL, response: Response): Promise<void>;
};

function edgeCache(): EdgeCache | null {
	try {
		return (caches as CacheStorage & { readonly default: EdgeCache }).default;
	} catch {
		return null;
	}
}

function cacheKey(context: Context<{ Bindings: Env }>): Request {
	const url = new URL(context.req.url);
	return new Request(`${url.origin}${url.pathname}`);
}

async function cachedPage(context: Context<{ Bindings: Env }>): Promise<Response | undefined> {
	if (resolveStatusCacheSeconds(context.env) <= 0) return undefined;
	try {
		return await edgeCache()?.match(cacheKey(context));
	} catch {
		return undefined;
	}
}

function cacheResponse(context: Context<{ Bindings: Env }>, response: Response, seconds: number): Response {
	const headers = new Headers(response.headers);
	headers.set('Cache-Control', `public, max-age=${seconds}`);
	const cacheable = new Response(response.body, { status: response.status, statusText: response.statusText, headers });
	const cache = edgeCache();
	if (cache && seconds > 0) {
		try {
			context.executionCtx.waitUntil(cache.put(cacheKey(context), cacheable.clone()).catch(() => undefined));
		} catch {
			// Unit tests may not expose a request execution context.
		}
	}
	return cacheable;
}

async function assetShell(context: Context<{ Bindings: Env }>): Promise<Response> {
	const requestUrl = new URL('/index.html', context.req.url);
	return context.env.ASSETS.fetch(new Request(requestUrl, { headers: context.req.raw.headers }));
}

async function internalJson<T>(context: Context<{ Bindings: Env }>, fetchApp: AppFetch, pathname: string): Promise<T | null> {
	try {
		const request = new Request(new URL(pathname, context.req.url), { headers: { Accept: 'application/json' } });
		const response = await fetchApp(request, context.env, context.executionCtx);
		return response.ok ? await response.json<T>() : null;
	} catch {
		return null;
	}
}

export function createPageRoutes(fetchApp: AppFetch) {
	const routes = new Hono<{ Bindings: Env }>();

	routes.get('/', async (context) => {
		const cached = await cachedPage(context);
		if (cached) return cached;
		const payload = await internalJson<PublicStatus>(context, fetchApp, '/api/status');
		const transformed = rewriteHead(await assetShell(context), statusHead(payload, absoluteBase(context.env, context.req.raw)));
		return cacheResponse(context, transformed, resolveStatusCacheSeconds(context.env));
	});

	routes.get('/incidents/:id', async (context) => {
		const cached = await cachedPage(context);
		if (cached) return cached;
		const id = context.req.param('id');
		const payload = await internalJson<{ incident: PublicIncident }>(context, fetchApp, `/api/status/incidents/${encodeURIComponent(id)}`);
		const transformed = rewriteHead(
			await assetShell(context),
			incidentHead(payload?.incident ?? null, absoluteBase(context.env, context.req.raw), id),
		);
		return cacheResponse(context, transformed, resolveStatusCacheSeconds(context.env));
	});

	routes.get('/robots.txt', (context) => {
		const base = absoluteBase(context.env, context.req.raw);
		return context.text(
			[
				'User-agent: *',
				'Allow: /',
				'Allow: /incidents/',
				'Disallow: /api/',
				'Disallow: /dashboard',
				'Disallow: /settings',
				'Disallow: /monitors/',
				'Disallow: /login',
				`Sitemap: ${base}/sitemap.xml`,
				'',
			].join('\n'),
			200,
			{ 'Cache-Control': 'public, max-age=3600' },
		);
	});

	routes.get('/sitemap.xml', async (context) => {
		const base = absoluteBase(context.env, context.req.raw);
		const payload = await internalJson<{ incidents: PublicIncident[] }>(context, fetchApp, '/api/status/incidents');
		const urls = [
			`<url><loc>${escapeHtml(`${base}/`)}</loc><changefreq>hourly</changefreq><priority>1.0</priority></url>`,
			...(payload?.incidents ?? []).map((incident) => {
				const lastModified = incident.resolvedAt ?? incident.startedAt;
				return `<url><loc>${escapeHtml(`${base}/incidents/${incident.id}`)}</loc><lastmod>${escapeHtml(new Date(lastModified).toISOString())}</lastmod><priority>0.6</priority></url>`;
			}),
		];
		return context.body(
			`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join('')}</urlset>`,
			200,
			{
				'Content-Type': 'application/xml; charset=UTF-8',
				'Cache-Control': 'public, max-age=10800',
			},
		);
	});

	routes.all('/', (context) => context.env.ASSETS.fetch(context.req.raw));
	routes.all('/incidents/*', (context) => context.env.ASSETS.fetch(context.req.raw));

	return routes;
}
