import { browser } from '$app/environment';
import { writable } from 'svelte/store';

export const themes = [{ id: 'default', label: 'SPH', colorModes: ['light', 'dark'] }] as const;
export type ThemeId = (typeof themes)[number]['id'];
export type ColorMode = 'light' | 'dark';
export type Appearance = { themeId: ThemeId; colorMode: ColorMode };
export const DEFAULT_APPEARANCE: Readonly<Appearance> = { themeId: 'default', colorMode: 'dark' };
const current = writable<Appearance>({ ...DEFAULT_APPEARANCE });
export const appearance = { subscribe: current.subscribe };

export function normalizeAppearance(value: { themeId?: unknown; colorMode?: unknown }): Appearance {
	return { themeId: themes.some(theme => theme.id === value.themeId) ? value.themeId as ThemeId : 'default', colorMode: value.colorMode === 'light' ? 'light' : 'dark' };
}

/** No user preferences are stored on the server or in a shared SSR store. */
export function applyAppearance(value: { themeId?: unknown; colorMode?: unknown }, persist = false): Appearance {
	const next = normalizeAppearance(value);
	if (!browser) return next;
	document.documentElement.dataset.uiTheme = next.themeId;
	document.documentElement.dataset.theme = next.colorMode;
	current.set(next);
	if (persist) {
		try { localStorage.setItem('theme', next.colorMode); } catch { /* Switching still works when storage is blocked. */ }
	}
	return next;
}

/** The head bootstrap already restored the legacy color-mode key before paint. */
export function initializeAppearance(): void {
	if (browser) applyAppearance({ themeId: document.documentElement.dataset.uiTheme, colorMode: document.documentElement.dataset.theme });
}

export function setColorMode(colorMode: ColorMode): void {
	if (browser) applyAppearance({ themeId: document.documentElement.dataset.uiTheme, colorMode }, true);
}
