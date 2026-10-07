import { localeMessages } from '$lib/locale-messages';
import type { DisplayLanguage } from '$lib/localization';

export type Link = { text: string; href: string };
export type Item = { id: string; text: string; icon: string; href?: string; children?: Link[]; badge?: string; external?: boolean };
export type MenuGroup = { id: string; label: string; items: Item[]; managerOnly?: boolean; systemAdministratorOnly?: boolean };
export type Breadcrumb = { label: string; href?: string };
export function localizedMenus(language: DisplayLanguage): MenuGroup[] {
	const text = localeMessages[language].navigation;
	return [
		{ id: 'general', label: text.groups.general, items: [
			{ id: 'dashboard', text: text.items.dashboard, icon: 'dashboard', href: '/' },
			{ id: 'myPage', text: text.items.myPage, icon: 'dashboard', href: '/mypage' },
			{ id: 'workCalendars', text: text.items.workCalendars, icon: 'calendar', href: '/work-calendars' },
			{ id: 'employees', text: text.items.employees, icon: 'table', href: '/employees' }
		] },
		{ id: 'assets', label: text.groups.assets, items: [
			{ id: 'itAssets', text: text.items.itAssets, icon: 'dashboard', href: '/it-assets' }
		] },
		{ id: 'masterManagement', label: text.groups.masterManagement, managerOnly: true, items: [
			{ id: 'employment', text: text.items.employment, icon: 'list', href: '/employee-masters/employment-types' },
			{ id: 'locations', text: text.items.locations, icon: 'list', href: '/locations' },
			{ id: 'itMasters', text: text.items.itMasters, icon: 'list', href: '/it-asset-masters' }
		] },
		{ id: 'siteManagement', label: text.groups.siteManagement, systemAdministratorOnly: true, items: [
			{ id: 'systemInformation', text: text.items.systemInformation, icon: 'list', href: '/system-information' },
			{ id: 'systemSettings', text: text.items.systemSettings, icon: 'settings', href: '/system-settings' }
		] }
	];
}

export const menus = localizedMenus('en');

export function breadcrumbsForPath(path: string, title: string, language: DisplayLanguage = 'en'): Breadcrumb[] {
	const breadcrumbs: Breadcrumb[] = [{ label: localeMessages[language].navigation.home, ...(path === '/' ? {} : { href: '/' }) }];
	for (const group of localizedMenus(language)) {
		for (const item of group.items) {
			if (item.href === path) return [...breadcrumbs, { label: group.label }, { label: item.text }];
			const child = item.children?.find((link) => link.href === path);
			if (child) return [...breadcrumbs, { label: group.label }, { label: item.text }, { label: child.text }];
		}
	}
	return [...breadcrumbs, { label: title }];
}

export function groupLabelForPath(path: string, language: DisplayLanguage = 'en'): string {
	const normalizedPath = path.length > 1 ? path.replace(/\/+$/, '') : path;
	for (const group of localizedMenus(language)) {
		if (group.items.some((item) => item.href === normalizedPath || item.children?.some((child) => child.href === normalizedPath))) return group.label;
	}
	return '';
}

// Return a stable ID rather than a translated label for accordion/flyout state.
export function parentMenuForPath(path: string): string | null {
	for (const group of menus) {
		for (const item of group.items) {
			if (item.children?.some((child) => child.href === path)) return item.id;
		}
	}
	return null;
}

	const svg = (body: string) => `<svg class="nav-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">${body}</svg>`;
	export const icons: Record<string, string> = {
		dashboard: svg('<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="4" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="10" width="7" height="11" rx="1.5"/>'),
		settings: svg('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>'),
		table: svg('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M9 10v9M15 10v9"/>'),
		list: svg('<path d="M4 6h16M4 12h16M4 18h10"/>'),
		calendar: svg('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/>'),
		external: svg('<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 13v5a2 2 0 01-2 2H6a2 2 0 01-2-2V8a2 2 0 012-2h5"/>')
	};
