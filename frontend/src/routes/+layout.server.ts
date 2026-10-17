import { DEFAULT_LOCALIZATION } from '$lib/localization';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals, setHeaders, url }) => {
	setHeaders({ 'cache-control': 'private, no-store' });
	// Track the destination so client navigation requests fresh server data,
	// even when it reuses this layout. The hook verifies the session first.
	return { initialLocalization: locals.initialLocalization ?? { ...DEFAULT_LOCALIZATION }, requestedPath: url.pathname + url.search };
};
