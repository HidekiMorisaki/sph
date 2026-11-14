import { searchFields } from '#lib/server/api/search.js';
export async function GET({locals,request,url}: import('./$types').RequestEvent) { return searchFields(locals.user,'assets'); }
