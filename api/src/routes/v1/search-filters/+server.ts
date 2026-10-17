import { savedFilters } from '$lib/server/api/search-filters';
export const GET = (event: import('./$types').RequestEvent) => savedFilters(event);
export const POST = (event: import('./$types').RequestEvent) => savedFilters(event);
