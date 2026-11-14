import { markdownImage } from '#lib/server/projects/markdown-images.js';
export const GET:import('./$types').RequestHandler=({locals,params})=>markdownImage(locals.user,params.key,'GET');
export const DELETE:import('./$types').RequestHandler=({locals,params})=>markdownImage(locals.user,params.key,'DELETE');
