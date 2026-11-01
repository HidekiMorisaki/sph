import { error } from '@sveltejs/kit';
import { ticketProjectCode } from '$lib/projects';

export function load({ url }: {url:URL}) {
 const ticket=url.searchParams.get('ticket');
 if(ticket!==null&&!ticketProjectCode(ticket))error(404,'Ticket not found');
 return {};
}
