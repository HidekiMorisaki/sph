import { localeMessages } from '$lib/locale-messages';
import type { DisplayLanguage } from '$lib/localization';

export type Link = { text: string; href: string };
export type Item = { id: string; text: string; icon: string; href?: string; children?: Link[]; badge?: string; external?: boolean };
export type MenuGroup = { id: string; label: string; items: Item[]; systemAdministratorOnly?: boolean };
export type Breadcrumb = { label: string; href?: string };
export function localizedMenus(language: DisplayLanguage): MenuGroup[] {
	const text = localeMessages[language].navigation;
	return [
		{ id: 'dashboard', label: text.groups.dashboard, items: [
			{ id: 'employeeAnalytics', text: text.items.employeeAnalytics, icon: 'employeeAnalytics', href: '/employee-analytics' },
			{ id: 'financialTrends', text: text.items.financialTrends, icon: 'trending_up', href: '/financial-trends' },
			{ id: 'assetOverview', text: text.items.assetOverview, icon: 'itAssets', href: '/asset-overview' }
		] },
		{ id: 'general', label: text.groups.general, items: [
   { id: 'schedule', text: language==='ja'?'スケジュール':'Schedule', icon: 'calendar', href: '/schedule' },
			{ id: 'workflows', text: language==='ja'?'ワークフロー':'Workflows', icon: 'workflow', href: '/workflows' },
			{ id: 'workCalendars', text: text.items.workCalendars, icon: 'calendar', href: '/work-calendars' },
			{ id: 'employees', text: text.items.employees, icon: 'employees', href: '/employees' }
		] },
        {id:'projects',label:language==='ja'?'プロジェクト':'PROJECTS',items:[
            {id:'projects',text:language==='ja'?'プロジェクト一覧':'Project list',icon:'projects',href:'/projects'},
            {id:'projectTickets',text:language==='ja'?'チケット':'Tickets',icon:'projectTickets',href:'/projects/tickets'},
            {id:'projectBoard',text:language==='ja'?'かんばん':'Board',icon:'projects',href:'/projects/board'},
            {id:'projectGantt',text:language==='ja'?'ガント':'Gantt',icon:'projectGantt',href:'/projects/gantt'}
        ]},
		{ id: 'businessManagement' , label: text.groups.businessManagement, items: [
			{ id: 'teams', text: text.items.teams, icon: 'teams', href: '/teams' },
			{ id: 'skills', text: text.items.skills, icon: 'skills', href: '/skills' },
			{ id: 'clients', text: text.items.clients, icon: 'clients', href: '/clients' },
			{ id: 'engagements', text: text.items.engagements, icon: 'engagements', href: '/engagements' }
		] },
		{ id: 'assets', label: text.groups.assets, items: [
			{ id: 'itAssets', text: text.items.itAssets, icon: 'itAssets', href: '/it-assets' },
			{ id: 'softwareLicenses', text: text.items.softwareLicenses, icon: 'softwareLicenses', href: '/licenses' },
			{ id: 'books', text: text.items.books, icon: 'books', href: '/books' }
		] },
		{ id: 'siteManagement', label: text.groups.siteManagement, systemAdministratorOnly: true, items: [
			{ id: 'systemInformation', text: text.items.systemInformation, icon: 'systemInformation', href: '/system-information' },
			{ id: 'systemSettings', text: text.items.systemSettings, icon: 'settings', href: '/system-settings' }
		] },
		{ id: 'development', label: text.groups.development, systemAdministratorOnly: true, items: [
			{ id: 'widgets', text: text.items.widgets, icon: 'widgets', href: '/widget-editor' }
		] }
	];
}

export const menus = localizedMenus('en');

export function breadcrumbsForPath(path: string, title: string, language: DisplayLanguage = 'en'): Breadcrumb[] {
	const breadcrumbs: Breadcrumb[] = [{ label: localeMessages[language].navigation.home, ...(path === '/' ? {} : { href: '/my-page' }) }];
	if(/^\/projects\/[A-Z][A-Z0-9_]{0,63}\//.test(path)){const id=path.split('/')[2],view=path.split('/')[3];const labels:Record<string,string>={overview:language==='ja'?'概要':'Overview',tickets:language==='ja'?'チケット':'Tickets',board:language==='ja'?'かんばん':'Board',gantt:language==='ja'?'ガント':'Gantt',history:language==='ja'?'履歴':'History',members:language==='ja'?'参加者':'Members',settings:language==='ja'?'設定':'Settings'};return [...breadcrumbs,{label:language==='ja'?'プロジェクト':'PROJECTS'},{label:language==='ja'?'プロジェクト一覧':'Project list',href:'/projects'},{label:title,href:'/projects/'+id+'/overview'},{label:labels[view]??view}];}
	if (path === '/my-page') return [...breadcrumbs, { label: localeMessages[language].navigation.items.myPage }];
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
	if(/^\/projects\/[A-Z][A-Z0-9_]{0,63}\//.test(path))return language==='ja'?'プロジェクト':'PROJECTS';
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

// Original sidebar artwork; no third-party icon assets are embedded.
const svg = (body: string) => `<svg class="nav-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
export const icons: Record<string, string> = {
 projectTickets:svg('<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>'),
 projectGantt:svg('<path d="M4 3v18h17M7 7h7M10 12h9M7 17h5"/>'),
 projects: svg('<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M8 4v17M15 4v17M3 9h18M10 13h3M17 17h2"/>'),
 workflow: svg('<rect x="3" y="3" width="7" height="5" rx="1"/><rect x="14" y="16" width="7" height="5" rx="1"/><path d="M6.5 8v10H14M10 5.5h7.5V16M14 12l3.5 4 3.5-4"/>'),
	employeeAnalytics: svg('<circle cx="8" cy="6" r="3"/><path d="M2 17v-2a6 6 0 0 1 9-5M14 20v-6M18 20V9M22 20V4"/>'),
	trending_up: svg('<path d="M3 20V4M3 20h18M6 15l5-5 4 3 6-8M16 5h5v5"/>'),
	myPage: svg('<path d="m3 11 9-8 9 8M5 10v11h14V10"/><circle cx="12" cy="12" r="2"/><path d="M8 19a4 4 0 0 1 8 0"/>'),
	calendar: svg('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18m-11 5 2 2 4-4"/>'),
	employees: svg('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M9 3h6v4H9zM14 12h4M14 16h4"/><circle cx="8" cy="12" r="2"/><path d="M5 18a3 3 0 0 1 6 0"/>'),
	teams: svg('<circle cx="12" cy="7" r="3"/><circle cx="4" cy="10" r="2"/><circle cx="20" cy="10" r="2"/><path d="M7 21v-4a5 5 0 0 1 10 0v4ZM2 19v-3a3 3 0 0 1 3-3m17 6v-3a3 3 0 0 0-3-3"/>'),
	skills: svg('<circle cx="12" cy="9" r="6"/><path d="m9 9 2 2 4-4M7 14l-2 7 5-2 2 2 2-2 5 2-2-7"/>'),
	clients: svg('<path d="M4 21V5l11-2v18M15 9h5v12M2 21h20M8 7h3M8 11h3M8 15h3M8 21v-3h3v3M18 12v1M18 16v1"/>'),
	engagements: svg('<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V3h8v4M3 12a21 21 0 0 0 18 0M10 12h4v4h-4z"/>'),
	itAssets: svg('<rect x="2" y="4" width="15" height="12" rx="1.5"/><path d="M7 16v4M4 20h10"/><rect x="19" y="8" width="3" height="13" rx="1"/><path d="M20.5 17h.01"/>'),
	softwareLicenses: svg('<path d="M14 3H4v18h16v-7M4 8h6"/><circle cx="16" cy="7" r="3"/><path d="m14 9-5 5v3h3v-2h2v-2l2-2"/>'),
	books: svg('<path d="M12 6C9 3 5 3 2 4v15c4-1 7 0 10 2 3-2 6-3 10-2V4c-3-1-7-1-10 2Zm0 0v15M5 8l4 1M5 12l4 1M15 9l4-1M15 13l4-1"/>'),
	systemInformation: svg('<rect x="3" y="3" width="18" height="7" rx="2"/><rect x="3" y="14" width="18" height="7" rx="2"/><path d="M7 6.5h.01M7 17.5h.01M12 6.5h5M12 17.5h5"/>'),
	settings: svg('<path d="M3 6h5M12 6h9M3 12h11M18 12h3M3 18h2M9 18h12"/><circle cx="10" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="7" cy="18" r="2"/>'),
	widgets: svg('<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h7v7h-7zM17.5 12v4M17.5 19v4M12 17.5h4M19 17.5h4"/>'),
	signOut: svg('<path d="M14 5V3H5v18h9v-2M10 12h11M17 8l4 4-4 4"/>')
};

export function menuIcon(item: Item): string {
	if (!item.external) return icons[item.icon];
	// Escape registered names before inserting them into SVG markup. The stable
	// link ID distinguishes systems even when they have the same initial/name.
	const initial = (Array.from(item.text.trim())[0] ?? '↗').toUpperCase()
		.replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`);
	const number = item.id.replace(/^external-/, '').replace(/\D/g, '');
	return svg(`<rect x="2" y="2" width="20" height="20" rx="3"/><text x="12" y="12" text-anchor="middle" font-size="10" fill="currentColor" stroke="none">${initial}</text><text x="12" y="20" text-anchor="middle" font-size="7" textLength="${number.length > 3 ? 17 : Math.max(5, number.length * 4)}" lengthAdjust="spacingAndGlyphs" fill="currentColor" stroke="none">${number}</text>`);
}

// Original section artwork, distinct from the individual destination icons.
export function groupIcon(id: string): string {
	const artwork: Record<string, string> = {
		dashboard: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
		projects:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 5V3h8v2M3 11h18M9 11v10M15 11v10"/>',
		general: '<circle cx="12" cy="7" r="4"/><path d="M4 21v-3a8 8 0 0 1 16 0v3"/>',
		businessManagement: '<rect x="3" y="6" width="18" height="15" rx="2"/><path d="M8 6V3h8v3M3 12h18M10 10h4v5h-4z"/>',
		assets: '<path d="m12 2 9 5v10l-9 5-9-5V7ZM3 7l9 5 9-5M12 12v10M7 4.8l10 5.6"/>',
		otherSystems: '<path d="M14 3h7v7M21 3l-9 9M10 3H3v18h18v-7"/>',
		development: '<path d="m8 5-6 7 6 7m8-14 6 7-6 7m-2-16-4 20"/>',
		siteManagement: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 9v12M6 6h.01M10 6h.01"/>'
	};
	return svg(artwork[id] ?? artwork.otherSystems);
}
