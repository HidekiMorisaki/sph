import { clients } from '$lib/server/api/clients';
export const GET = (event: import('./$types').RequestEvent) => clients(event);
export const PATCH = (event: import('./$types').RequestEvent) => clients(event);
export const DELETE = (event: import('./$types').RequestEvent) => clients(event);
