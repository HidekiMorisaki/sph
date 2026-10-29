import {searchResults} from '$lib/server/api/search';
export const POST:import('./$types').RequestHandler=async ({locals,request,url})=>searchResults(locals.user,'projectTickets',request,url);
