import { defineEnvVars } from '@sveltejs/kit/env';

// Runtime-only private values. Existing server services validate required values.
export const variables = defineEnvVars({
	API_INTERNAL_ORIGIN: { schema: (value: string | undefined) => value }
});
