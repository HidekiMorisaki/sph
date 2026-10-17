import { savedFilters } from '$lib/server/api/search-filters';
export const GET = (event: import('./$types').RequestEvent) => savedFilters(event);
export const PATCH = (event: import('./$types').RequestEvent) => savedFilters(event);
export const DELETE = (event: import('./$types').RequestEvent) => savedFilters(event);
