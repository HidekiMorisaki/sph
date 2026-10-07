import { throwApiError } from './response';

export function parseVisibleSearch(url: URL, allowed: readonly string[]): { keys: string[]; locale: 'en' | 'ja' } | null {
	const raw = url.searchParams.get('visibleSearch');
	if (raw === null) return null;
	const keys = raw.split(',');
	if (!keys.length || keys.length > allowed.length || keys.some((key) => !allowed.includes(key)) || new Set(keys).size !== keys.length) {
		throwApiError(422, 'INVALID_VISIBLE_SEARCH', 'Unsupported visible search fields.', [{ field: 'visibleSearch', reason: 'INVALID_VALUE' }]);
	}
	const locale = url.searchParams.get('searchLocale') ?? 'en';
	if (locale !== 'en' && locale !== 'ja') throwApiError(422, 'INVALID_SEARCH_LOCALE', 'Unsupported search language.', [{ field: 'searchLocale', reason: 'INVALID_VALUE' }]);
	return { keys, locale };
}

export function containsPattern(value: string): string {
	return `%${value.replace(/[\\%_]/g, '\\$&')}%`;
}
