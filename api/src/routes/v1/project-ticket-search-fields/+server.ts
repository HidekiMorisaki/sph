import {searchFields} from '$lib/server/api/search';
export const GET:import('./$types').RequestHandler=async ({locals,request,url})=>searchFields(locals.user,'projectTickets');
