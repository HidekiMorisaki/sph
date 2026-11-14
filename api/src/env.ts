import { defineEnvVars } from '@sveltejs/kit/env';

// Runtime-only private values. Existing server services validate required values.
export const variables = defineEnvVars({
	DATABASE_URL: { schema: (value: string | undefined) => value },
	IT_ASSET_CREDENTIAL_ENCRYPTION_KEY: { schema: (value: string | undefined) => value },
	SPH_SYSTEM_METRICS: { schema: (value: string | undefined) => value }
});
