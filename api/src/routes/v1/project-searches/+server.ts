import {searchResults} from '#lib/server/api/search.js';
export const POST=(e:import('./$types').RequestEvent)=>searchResults(e.locals.user,'projects',e.request,e.url);
