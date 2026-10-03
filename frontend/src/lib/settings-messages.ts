import apiReasons from './settings-api-reasons.json';
import { formatLocaleTemplate, localeMessages, type MessageLanguage } from '$lib/locale-messages';

// Keep protocol reasons and local message keys in state, translating at render time.
export function settingsFieldError(reason: string, language: MessageLanguage): string {
	const text = localeMessages[language].settings;
	if (Object.hasOwn(text, reason)) return text[reason as keyof typeof text];
	if (Object.hasOwn(apiReasons, reason)) return text[apiReasons[reason as keyof typeof apiReasons] as keyof typeof text];
	const maximum = /^Enter (\d+) characters or fewer\.$/.exec(reason);
	if (maximum) return formatLocaleTemplate(text.maximum, maximum[1]);
	const maximumLinks = /^Enter no more than (\d+) links\.$/.exec(reason);
	return maximumLinks ? formatLocaleTemplate(text.maximumLinks, maximumLinks[1]) : text.invalidField;
}

export function settingsSaveError(code: string | undefined, status: number, fallback: 'profileFailed' | 'localizationFailed' | 'socialFailed' | 'passwordFailed'): string {
	if (status === 401) return 'signInRequired';
	if (status === 403) return 'forbidden';
	if (status === 404) return 'notFound';
	const keys: Record<string, string> = {
		VALIDATION_ERROR: 'validation', EMPLOYEE_FIELD_CONFLICT: 'conflict',
		INVALID_CURRENT_PASSWORD: 'currentPasswordIncorrect', INVALID_REQUEST: 'invalidRequest'
	};
	return code && Object.hasOwn(keys, code) ? keys[code] : fallback;
}
