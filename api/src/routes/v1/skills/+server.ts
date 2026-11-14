import { workforceMaster } from '#lib/server/api/workforce.js';
export const GET = (event: import('./$types').RequestEvent) => workforceMaster(event, 'skills');
export const POST = (event: import('./$types').RequestEvent) => workforceMaster(event, 'skills');
