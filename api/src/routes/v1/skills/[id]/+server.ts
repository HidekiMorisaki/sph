import { workforceMaster } from '$lib/server/api/workforce';
export const GET = (event: import('./$types').RequestEvent) => workforceMaster(event, 'skills');
export const PATCH = (event: import('./$types').RequestEvent) => workforceMaster(event, 'skills');
export const DELETE = (event: import('./$types').RequestEvent) => workforceMaster(event, 'skills');
