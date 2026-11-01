import { ticketProjectCode } from './projects';
/** Internal destinations returned by the existing notification resolvers. */
export function notificationDestination(href: string | null): string | null {
 if (!href) return null;
 if (href.startsWith('/schedule?occurrence=') || href.startsWith('/workflows?request=') || href === '/schedule?notice=unavailable') return href;
 const match=/^\/projects\/tickets\?ticket=([^&#?]+)$/.exec(href);
 return match&&ticketProjectCode(match[1])?href:null;
}
