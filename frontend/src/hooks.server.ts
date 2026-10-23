import { error, type Handle } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { DEFAULT_LOCALIZATION } from '$lib/localization';
import { loginUrl } from '$lib/login-redirect';
import { readInitialLocalization } from '$lib/server/initial-localization';
import { createHtmlPreloads } from '$lib/server/html-preloads';

export const handle: Handle = async ({ event, resolve }) => {
	if (event.route.id !== null) {
		let preferences;
		try {
			preferences = await readInitialLocalization(event.cookies.get('equipment_session'), env.API_INTERNAL_ORIGIN ?? 'http://127.0.0.1:5174');
		} catch {
			// The public sign-in page renders only its waiting state until the
			// browser confirms readiness and validates the existing session again.
			if (event.route.id !== '/') error(503, 'Unable to verify session. Please try again.');
			preferences = null;
		}
		const publicPage = event.route.id === '/' || event.route.id === '/account-setup';
		if (!preferences && !publicPage) {
			return new Response(null, { status: 303, headers: {
				location: loginUrl(event.url), 'cache-control': 'private, no-store'
			} });
		}
		event.locals.initialLocalization = preferences ?? { ...DEFAULT_LOCALIZATION };
		event.locals.displayLanguage = event.locals.initialLocalization.displayLanguage;
	}
	const preloads = createHtmlPreloads();
	return resolve(event, {
		preload: preloads.preload,
		transformPageChunk: ({ html }) => preloads.transform(html.replace('<html lang="en"', `<html lang="${event.locals.displayLanguage ?? 'en'}"`))
	});
};
