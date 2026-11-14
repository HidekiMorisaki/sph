import { workforceRecords } from '#lib/server/api/workforce.js';
export const GET = (event: import('./$types').RequestEvent) => workforceRecords(event, 'skills');
export const POST = (event: import('./$types').RequestEvent) => workforceRecords(event, 'skills');
