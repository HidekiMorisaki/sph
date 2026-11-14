import {searchFields,searchResults} from '#lib/server/api/search.js';
export const GET:import('./$types').RequestHandler=async({locals,request,url})=>searchFields(locals.user,'projectMembers',url);
