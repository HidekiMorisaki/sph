import { workforceMaster } from '$lib/server/api/workforce';
export const GET = (event: import('./$types').RequestEvent) => workforceMaster(event, 'projects');
export const POST = (event: import('./$types').RequestEvent) => workforceMaster(event, 'projects');
