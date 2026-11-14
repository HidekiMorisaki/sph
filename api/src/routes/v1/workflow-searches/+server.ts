import {searchResults} from '#lib/server/api/search.js';
export async function POST({locals,request,url}:import('./$types').RequestEvent){return searchResults(locals.user,'workflows',request,url);}
