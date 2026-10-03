import { error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { readInitialLocalization } from '$lib/server/initial-localization';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ cookies, locals, setHeaders }) => {
	setHeaders({ 'cache-control': 'private, no-store' });
	try {
		const initialLocalization = await readInitialLocalization(cookies.get('equipment_session'), env.API_INTERNAL_ORIGIN ?? 'http://127.0.0.1:5174');
		locals.displayLanguage = initialLocalization.displayLanguage;
		return { initialLocalization };
	} catch {
		error(503, 'Unable to load display settings. Please try again.');
	}
};
