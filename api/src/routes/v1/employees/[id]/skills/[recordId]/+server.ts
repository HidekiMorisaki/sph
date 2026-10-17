import { workforceRecords } from '$lib/server/api/workforce';
export const PATCH = (event: import('./$types').RequestEvent) => workforceRecords(event, 'skills');
export const DELETE = (event: import('./$types').RequestEvent) => workforceRecords(event, 'skills');
