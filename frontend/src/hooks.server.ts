import { error } from '@sveltejs/kit';
import type { Handle } from '@sveltejs/kit/hooks';
import * as env from '$app/env/private';
import { DEFAULT_LOCALIZATION } from '#lib/localization.js';
import { loginUrl } from '#lib/login-redirect.js';
import { readInitialSession } from '#lib/server/initial-localization.js';
import { createHtmlPreloads } from '#lib/server/html-preloads.js';

export const handle: Handle = async ({ event, resolve }) => {
	// GHSA-pfhg-q3qv-9q6r: reject protocol-relative action paths before serving them.
	if (event.url.pathname.startsWith('//')) error(400, 'Invalid request path.');
	if (event.route.id !== null) {
		let preferences;
		try {
			preferences = await readInitialSession(event.cookies.get('equipment_session'), env.API_INTERNAL_ORIGIN ?? 'http://127.0.0.1:5174');
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
		event.locals.canManageDevelopment = preferences?.canManageSystemSettings === true;
		event.locals.initialLocalization = preferences ? { timeZone: preferences.timeZone, displayLanguage: preferences.displayLanguage, displayCurrency: preferences.displayCurrency } : { ...DEFAULT_LOCALIZATION };
		event.locals.displayLanguage = event.locals.initialLocalization.displayLanguage;
	}
	const preloads = createHtmlPreloads();
	return resolve(event, {
		preload: preloads.preload,
		transformPageChunk: ({ html }) => preloads.transform(html.replace('<html lang="en"', `<html lang="${event.locals.displayLanguage ?? 'en'}"`))
	});
};
