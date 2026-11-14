import { workforceRecords } from '#lib/server/api/workforce.js';
export const PATCH = (event: import('./$types').RequestEvent) => workforceRecords(event, 'participations');
export const DELETE = (event: import('./$types').RequestEvent) => workforceRecords(event, 'participations');
