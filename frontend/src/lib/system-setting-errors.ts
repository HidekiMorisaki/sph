import type EnglishMessages from './locales/en/systemSettings.json';
type Messages = typeof EnglishMessages;
/** Existing REST validation identifiers, independent of displayed language. */
const reasons = {
	'Enter a name.': 'nameRequired',
	'Enter 128 characters or fewer.': 'nameLength',
	'Enter a URL.': 'urlRequired',
	'Enter 2048 characters or fewer.': 'urlLength',
	'Enter a valid HTTP or HTTPS URL.': 'urlInvalid',
	'Do not include a username or password in the URL.': 'urlCredentials',
	'Enter a whole number from 0 to 2147483647.': 'sortInvalid'
} as const;
export function systemSettingReason(reason: string, text: Messages, resource: 'role' | 'link'): string {
	if (reason === 'DUPLICATE_VALUE') return resource === 'role' ? text.roleDuplicate : text.linkDuplicate;
	const key = reasons[reason as keyof typeof reasons];
	return key ? text[key] : text.invalidValue;
}
export function systemSettingError(code: string | undefined, status: number, text: Messages, resource: 'role' | 'link', fallback: string): string {
	if (status === 401) return text.signInRequired;
	if (status === 403) return resource === 'role' ? text.roleForbidden : text.linkSaveForbidden;
	if (status === 404) return text.notFound;
	if (code === 'DUPLICATE_VALUE') return resource === 'role' ? text.roleDuplicate : text.linkDuplicate;
	return fallback;
}
