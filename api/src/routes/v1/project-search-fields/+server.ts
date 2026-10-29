import {searchFields} from '$lib/server/api/search';
export const GET=(e:import('./$types').RequestEvent)=>searchFields(e.locals.user,'projects');
