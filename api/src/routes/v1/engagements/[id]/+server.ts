import { workforceMaster } from '#lib/server/api/workforce.js';
export const GET = (event: import('./$types').RequestEvent) => workforceMaster(event, 'engagements');
export const PATCH = (event: import('./$types').RequestEvent) => workforceMaster(event, 'engagements');
export const DELETE = (event: import('./$types').RequestEvent) => workforceMaster(event, 'engagements');
