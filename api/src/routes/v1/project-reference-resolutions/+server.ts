import { resolveProjectReferences } from '$lib/server/projects/references';
export const POST:import('./$types').RequestHandler=({locals,request})=>resolveProjectReferences(locals.user,request);
