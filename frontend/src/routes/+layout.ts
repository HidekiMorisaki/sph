import type { LayoutLoad } from './$types';
import { get } from 'svelte/store';
import { browser } from '$app/environment';
import { localization, hasInitialLocalization } from '$lib/localization';
import { loadLocaleNamespaces, namespacesForPath, setActiveNamespaces } from '$lib/locale-messages';

export const load: LayoutLoad = async ({ url, data }) => {
	const namespaces = namespacesForPath(url.pathname);
	const initialLocalization = browser && hasInitialLocalization() ? get(localization) : data.initialLocalization;
	if (browser) setActiveNamespaces(namespaces);
	await loadLocaleNamespaces(initialLocalization.displayLanguage, namespaces);
	// The unauthenticated sign-in screen keeps its existing English presentation.
	if (url.pathname === '/') await loadLocaleNamespaces('en', ['login']);
	return { initialLocalization };
};
