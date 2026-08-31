import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

const migrations = await readD1Migrations('./migrations');

export default defineConfig({
	plugins: [
		cloudflareTest({
			wrangler: { configPath: './wrangler.jsonc' },
			miniflare: {
				// STATUS_CACHE_SECONDS '0' disables the public-status edge cache so assertions see
				// fresh D1 reads instead of a response cached by an earlier test.
				bindings: { TEST_MIGRATIONS: migrations, STATUS_CACHE_SECONDS: '0' },
			},
		}),
	],
});
