import apiReasons from './employee-api-reasons.json';
import { localeMessages, formatLocaleTemplate, type MessageLanguage } from '$lib/locale-messages';

// Existing API reasons are English protocol values. Resolve them against the
// protocol mapping; display only the selected language's matching message.
export function employeeFieldError(reason: string, language: MessageLanguage): string {
	const translated = localeMessages[language].employees.errors;
	const key = (apiReasons as Record<string, keyof typeof translated>)[reason];
	if (key) return translated[key];
	const maximum = /^Enter (\d+) characters or fewer\.$/.exec(reason);
	return maximum ? formatLocaleTemplate(translated.maximum, maximum[1]) : translated.invalidField;
}

export function employeeSaveError(code: string | undefined, status: number, language: MessageLanguage): string {
	const text = localeMessages[language].employees;
	const codes: Record<string, string> = {
		VALIDATION_ERROR: text.errors.validation,
		EMPLOYEE_FIELD_CONFLICT: text.errors.conflict,
		ROLE_ASSIGNMENT_FORBIDDEN: text.roleForbidden,
		LAST_SYSTEM_ADMINISTRATOR: text.lastAdministrator,
		HTTPS_REQUIRED: text.errors.httpsRequired,
		INVALID_REQUEST: text.errors.invalidRequest
	};
	return codes[code ?? ''] ?? (status === 401 ? localeMessages[language].common.signInRequired : status === 403 ? text.errors.forbidden : status === 404 ? text.errors.notFound : text.saveFailed);
}
