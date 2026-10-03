import en from '../locales/en.json' with { type: 'json' };
import ja from '../locales/ja.json' with { type: 'json' };

export const DEFAULT_TIME_ZONE = 'Asia/Tokyo';
export const DEFAULT_DISPLAY_LANGUAGE = 'en';
// Application allowlist: valid language tags are not necessarily supported UI languages.
export const DISPLAY_LANGUAGES = [
	{ value: 'en', label: en.languageName },
	{ value: 'ja', label: ja.languageName }
] as const;

export type DisplayLanguage = (typeof DISPLAY_LANGUAGES)[number]['value'];

export function isDisplayLanguage(value: unknown): value is DisplayLanguage {
	return typeof value === 'string' && DISPLAY_LANGUAGES.some((language) => language.value === value);
}

export function isTimeZone(value: unknown): value is string {
	if (typeof value !== 'string' || value.length === 0 || value.length > 64) return false;
	try {
		new Intl.DateTimeFormat('en', { timeZone: value }).format();
		return true;
	} catch {
		return false;
	}
}
