import {searchFields,searchResults} from '#lib/server/api/search.js';
export const POST:import('./$types').RequestHandler=async({locals,request,url})=>searchResults(locals.user,'projectMembers',request,url);
