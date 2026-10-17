import { workforceMaster } from '$lib/server/api/workforce';
export const GET = (event: import('./$types').RequestEvent) => workforceMaster(event, 'projects');
export const PATCH = (event: import('./$types').RequestEvent) => workforceMaster(event, 'projects');
export const DELETE = (event: import('./$types').RequestEvent) => workforceMaster(event, 'projects');
