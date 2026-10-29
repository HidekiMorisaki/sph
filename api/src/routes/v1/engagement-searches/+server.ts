import { searchResults } from '$lib/server/api/search';
export async function POST({locals,request,url}: import('./$types').RequestEvent) { return searchResults(locals.user,'engagements',request,url); }
