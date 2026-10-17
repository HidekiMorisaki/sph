import { clients } from '$lib/server/api/clients';
export const GET = (event: import('./$types').RequestEvent) => clients(event);
export const POST = (event: import('./$types').RequestEvent) => clients(event);
