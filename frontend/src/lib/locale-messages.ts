import enCore from './locales/en/core.json';
import jaCore from './locales/ja/core.json';
import enCommon from './locales/en/common.json';
import jaCommon from './locales/ja/common.json';
import enNavigation from './locales/en/navigation.json';
import jaNavigation from './locales/ja/navigation.json';

export type MessageLanguage = 'en' | 'ja';
export type FeatureCatalogs = {
	workforce: typeof import('./locales/en/workforce.json');
	teams: typeof import('./locales/en/teams.json');
	masters: typeof import('./locales/en/masters.json');
	analytics: typeof import('./locales/en/analytics.json');
	assets: typeof import('./locales/en/assets.json');
	assetOverview: typeof import('./locales/en/assetOverview.json');
	software: typeof import('./locales/en/software.json');
	financial: typeof import('./locales/en/financial.json');
	financialTrends: typeof import('./locales/en/financialTrends.json');
	employees: typeof import('./locales/en/employees.json');
	employeeForm: typeof import('./locales/en/employeeForm.json');
	login: typeof import('./locales/en/login.json');
	myPage: typeof import('./locales/en/myPage.json');
	settings: typeof import('./locales/en/settings.json');
	systemSettings: typeof import('./locales/en/systemSettings.json');
	systemReleases: typeof import('./locales/en/systemReleases.json');
	workCalendars: typeof import('./locales/en/workCalendars.json');
};
export type LocaleNamespace = keyof FeatureCatalogs;
type Catalog = typeof enCore & { common: typeof enCommon; navigation: typeof enNavigation } & FeatureCatalogs;
const loaders = import.meta.glob<{ default: unknown }>('./locales/*/*.json');
const cache = new Map<string, unknown>();
const pending = new Map<string, Promise<void>>();
let activeNamespaces: readonly LocaleNamespace[] = [];

export function namespacesForPath(path: string): LocaleNamespace[] {
	if (path === '/') return ['login', 'analytics'];
	if (path === '/employee-analytics') return ['analytics'];
	if (path === '/my-page') return ['myPage', 'employees', 'teams', 'workforce'];
	if (path === '/skills' || path === '/projects' || path === '/clients') return ['workforce'];
	if (path === '/teams') return ['teams', 'employees', 'workforce'];
	if (path === '/employees') return ['employees', 'employeeForm', 'teams', 'workforce'];
	if (path === '/work-calendars') return ['workCalendars'];
	if (path === '/system-settings') return ['systemSettings', 'systemReleases', 'financial', 'employees', 'teams', 'workforce'];
	if (path === '/system-information') return ['systemSettings', 'systemReleases'];
	if (path === '/financial-information') return ['systemSettings', 'financial'];
	if (path === '/asset-overview') return ['assetOverview'];
	if (path === '/financial-trends') return ['financialTrends'];
	if (path === '/personal-settings') return ['settings'];
	if (path === '/locations') return ['masters', 'employees', 'teams', 'workforce'];
	if (path === '/employee-masters' || path === '/it-asset-masters') return ['masters'];
	if (path === '/it-assets') return ['assets', 'employees', 'teams', 'workforce'];
	if (path === '/licenses') return ['software'];
	return [];
}
export function setActiveNamespaces(namespaces: readonly LocaleNamespace[]): void { activeNamespaces = [...namespaces]; }
export async function loadActiveLocale(language: MessageLanguage): Promise<void> {
	let namespaces: readonly LocaleNamespace[];
	do { namespaces = activeNamespaces; await loadLocaleNamespaces(language, namespaces); } while (namespaces !== activeNamespaces);
}
export async function loadLocaleNamespaces(language: MessageLanguage, namespaces: readonly LocaleNamespace[]): Promise<void> {
	await Promise.all(namespaces.map(async namespace => {
		const key = `${language}/${namespace}`;
		if (cache.has(key)) return;
		if (!pending.has(key)) {
			const loader = loaders[`./locales/${key}.json`];
			if (!loader) throw new Error('Unsupported locale namespace.');
			pending.set(key, loader().then(module => { cache.set(key, module.default); }).finally(() => { pending.delete(key); }));
		}
		await pending.get(key);
	}));
}
export function isLocaleLoaded(language: MessageLanguage, namespace: LocaleNamespace): boolean { return cache.has(`${language}/${namespace}`); }
function catalog(language: MessageLanguage, core: typeof enCore, common: typeof enCommon, navigation: typeof enNavigation): Catalog {
	const result = { ...core, common, navigation };
	for (const namespace of ['workforce', 'teams', 'masters', 'analytics', 'assets', 'assetOverview', 'software', 'financial', 'financialTrends', 'employees', 'employeeForm', 'login', 'myPage', 'settings', 'systemSettings', 'systemReleases', 'workCalendars'] as const) {
		Object.defineProperty(result, namespace, { enumerable: true, get() {
			const value = cache.get(`${language}/${namespace}`);
			if (!value) throw new Error(`Locale namespace not loaded: ${language}/${namespace}`);
			return value;
		}});
	}
	return result as Catalog;
}
export const localeMessages = { en: catalog('en', enCore, enCommon, enNavigation), ja: catalog('ja', jaCore, jaCommon, jaNavigation) };

export function formatLocaleTemplate(template: string, ...values: (string | number)[]): string {
	return template.replace(/\{([1-9][0-9]*)\}/g, (_, position: string) => {
		if (Number(position) > values.length) throw new Error('Missing translation parameter.');
		return String(values[Number(position) - 1]);
	});
}
