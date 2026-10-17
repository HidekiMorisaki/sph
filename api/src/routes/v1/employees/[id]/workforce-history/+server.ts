import { workforceHistory } from '$lib/server/api/workforce';
export const GET = (event: import('./$types').RequestEvent) => workforceHistory(event);
