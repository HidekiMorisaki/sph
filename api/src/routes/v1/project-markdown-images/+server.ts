import { uploadMarkdownImage } from '$lib/server/projects/markdown-images';
export const POST:import('./$types').RequestHandler=({locals,request,url})=>uploadMarkdownImage(locals.user,request,url);
