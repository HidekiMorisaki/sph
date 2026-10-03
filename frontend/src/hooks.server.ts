import type { Handle } from '@sveltejs/kit';

export const handle: Handle = ({ event, resolve }) => resolve(event, {
	transformPageChunk: ({ html }) => html.replace('<html lang="en"', `<html lang="${event.locals.displayLanguage ?? 'en'}"`)
});
