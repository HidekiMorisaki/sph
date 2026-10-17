import { searchFields } from '$lib/server/api/search';
export async function GET({locals}: import('./$types').RequestEvent) { return searchFields(locals.user,'books'); }
