import {searchResults} from '$lib/server/api/search';
export const POST=(e:import('./$types').RequestEvent)=>searchResults(e.locals.user,'projects',e.request,e.url);
