import { resolveProjectReferences } from '#lib/server/projects/references.js';
export const POST:import('./$types').RequestHandler=({locals,request})=>resolveProjectReferences(locals.user,request);
