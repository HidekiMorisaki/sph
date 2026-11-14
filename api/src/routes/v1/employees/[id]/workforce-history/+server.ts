import { workforceHistory } from '#lib/server/api/workforce.js';
export const GET = (event: import('./$types').RequestEvent) => workforceHistory(event);
