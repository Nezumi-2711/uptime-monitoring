import { applyD1Migrations, type D1Migration } from 'cloudflare:test';
import { env, exports as worker } from 'cloudflare:workers';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { escapeHtml, incidentHead, renderMetaTags, statusHead } from '../src/worker/seo/meta';

async function resetDatabase() {
	await env.DB.batch([
		env.DB.prepare('DELETE FROM incident_updates'),
		env.DB.prepare('DELETE FROM incident_monitors'),
		env.DB.prepare('DELETE FROM incidents'),
		env.DB.prepare('DELETE FROM checks'),
		env.DB.prepare('DELETE FROM monitors'),
	]);
}

async function seedIncident() {
	const now = Date.now();
	const monitor = await env.DB.prepare(
		"INSERT INTO monitors (name, url, method, expected_status, interval_seconds, timeout_ms, enabled, alerts_enabled, failure_threshold, consecutive_failures, last_ok, last_degraded, created_at, updated_at) VALUES ('Public API', 'https://api.example.com', 'GET', 200, 300, 10000, 1, 1, 2, 0, 0, 0, ?, ?)",
	)
		.bind(now, now)
		.run();
	const incident = await env.DB.prepare(
		"INSERT INTO incidents (title, status, impact, source, kind, started_at, created_at, updated_at) VALUES ('API connectivity issue', 'investigating', 'major', 'manual', 'down', ?, ?, ?)",
	)
		.bind(now, now, now)
		.run();
	const incidentId = Number(incident.meta.last_row_id);
	await env.DB.batch([
		env.DB.prepare('INSERT INTO incident_monitors (incident_id, monitor_id) VALUES (?, ?)').bind(incidentId, monitor.meta.last_row_id),
		env.DB.prepare(
			"INSERT INTO incident_updates (incident_id, status, body, source, created_at) VALUES (?, 'investigating', 'We are investigating elevated connection failures.', 'manual', ?)",
		).bind(incidentId, now),
	]);
	return incidentId;
}

describe('SEO metadata helpers', () => {
	it('escapes untrusted metadata and emits absolute social metadata', () => {
		const head = incidentHead(
			{
				id: 4,
				title: 'API <outage>',
				status: 'resolved',
				impact: 'major',
				source: 'manual',
				startedAt: '2026-08-30T10:00:00.000Z',
				services: [{ id: 1, name: 'API' }],
				updates: [{ status: 'resolved', body: 'Service restored & stable.', createdAt: '2026-08-30T11:00:00.000Z' }],
			},
			'https://status.example.com',
			'4',
		);
		const tags = renderMetaTags(head);
		expect(tags).toContain('API &lt;outage&gt;');
		expect(tags).toContain('https://status.example.com/og.png');
		expect(tags).toContain('summary_large_image');
		expect(escapeHtml('"<&')).toBe('&quot;&lt;&amp;');
	});

	it('builds a neutral fallback status head', () => {
		expect(statusHead(null, 'https://example.com')).toMatchObject({
			title: 'Service status — upwatch',
			canonical: 'https://example.com/',
			robots: 'index,follow',
		});
	});
});

describe('crawler-facing routes', () => {
	beforeAll(async () => {
		const testEnv = env as Env & { TEST_MIGRATIONS: D1Migration[] };
		await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);
	});
	beforeEach(resetDatabase);

	it('renders status metadata into the SPA shell', async () => {
		const response = await worker.default.fetch('https://status.example.com/');
		const html = await response.text();
		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toContain('text/html');
		expect(html).toContain('<title>All systems operational — upwatch status</title>');
		expect(html).toContain('content="https://status.example.com/og.png"');
		expect(html).toContain('name="twitter:card" content="summary_large_image"');
	});

	it('renders incident metadata and a safe missing-incident fallback', async () => {
		const incidentId = await seedIncident();
		const response = await worker.default.fetch(`https://status.example.com/incidents/${incidentId}`);
		const html = await response.text();
		expect(html).toContain('API connectivity issue — investigating — upwatch status');
		expect(html).toContain('We are investigating elevated connection failures.');

		const missingHtml = await (await worker.default.fetch('https://status.example.com/incidents/999999')).text();
		expect(missingHtml).toContain('Incident not found — upwatch status');
		expect(missingHtml).toContain('content="noindex,follow"');
	});

	it('publishes crawler policy and recent resolved incidents', async () => {
		const incidentId = await seedIncident();
		const now = Date.now();
		await env.DB.prepare("UPDATE incidents SET status = 'resolved', resolved_at = ?, duration_ms = 1000, updated_at = ? WHERE id = ?")
			.bind(now, now, incidentId)
			.run();

		const robots = await (await worker.default.fetch('https://status.example.com/robots.txt')).text();
		expect(robots).toContain('Allow: /incidents/');
		expect(robots).toContain('Disallow: /dashboard');
		expect(robots).toContain('Sitemap: https://status.example.com/sitemap.xml');

		const sitemapResponse = await worker.default.fetch('https://status.example.com/sitemap.xml');
		const sitemap = await sitemapResponse.text();
		expect(sitemapResponse.headers.get('content-type')).toContain('application/xml');
		expect(sitemap).toContain('<loc>https://status.example.com/</loc>');
		expect(sitemap).toContain(`<loc>https://status.example.com/incidents/${incidentId}</loc>`);
	});
});
