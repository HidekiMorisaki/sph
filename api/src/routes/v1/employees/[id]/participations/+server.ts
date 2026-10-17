import { workforceRecords } from '$lib/server/api/workforce';
export const GET = (event: import('./$types').RequestEvent) => workforceRecords(event, 'participations');
export const POST = (event: import('./$types').RequestEvent) => workforceRecords(event, 'participations');
