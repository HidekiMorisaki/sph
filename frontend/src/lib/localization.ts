import { get, writable } from 'svelte/store';
import { productName } from '$lib/brand';
import { formatPersonName, type PersonNameOrder, type PersonNameParts } from '$lib/person-name';

export const GENDER_VALUES = ['female', 'male', 'unspecified'] as const;
export type GenderValue = (typeof GENDER_VALUES)[number];

export const DISPLAY_LANGUAGES = [
	{ value: 'en', label: 'English', locale: 'en-US', employeeNameFallbackOrder: 'givenFirst', durationPartSeparator: ' ', removeDurationUnitSpacing: false, genderLabels: { female: 'Female', male: 'Male', unspecified: 'Unspecified' }, invitationEmailSubject: `${productName} invitation link` },
	{ value: 'ja', label: '日本語', locale: 'ja-JP', employeeNameFallbackOrder: 'surnameFirst', durationPartSeparator: '', removeDurationUnitSpacing: true, genderLabels: { female: '女性', male: '男性', unspecified: '未指定' }, invitationEmailSubject: `${productName} への招待リンク` }
] as const;

export type DisplayLanguage = (typeof DISPLAY_LANGUAGES)[number]['value'];

export type LocalizationSettings = {
	timeZone: string;
	displayLanguage: DisplayLanguage;
};

export type EmployeeNameParts = PersonNameParts;

export const DEFAULT_LOCALIZATION: LocalizationSettings = { timeZone: 'Asia/Tokyo', displayLanguage: 'en' };
export const localization = writable<LocalizationSettings>(DEFAULT_LOCALIZATION);

export function applyLocalization(settings: LocalizationSettings): void {
	localization.set(settings);
	if (typeof document !== 'undefined') document.documentElement.lang = settings.displayLanguage;
}

function languageDefinition(displayLanguage: DisplayLanguage) {
	return DISPLAY_LANGUAGES.find(({ value }) => value === displayLanguage) ?? DISPLAY_LANGUAGES[0];
}

function locale(settings: LocalizationSettings): string {
	return languageDefinition(settings.displayLanguage).locale;
}

export function displayLanguageOptions() {
	return DISPLAY_LANGUAGES.map(({ value, label }) => ({ value, label }));
}

function isGenderValue(value: string): value is GenderValue {
	return GENDER_VALUES.some((gender) => gender === value);
}

export function formatGender(value: string | null | undefined, settings = get(localization)): string {
	if (!value) return '';
	return isGenderValue(value) ? languageDefinition(settings.displayLanguage).genderLabels[value] : value;
}

export function genderOptions(settings = get(localization)) {
	return GENDER_VALUES.map((value) => ({ value, label: formatGender(value, settings) }));
}

export function invitationEmailSubject(settings = get(localization)): string {
	return languageDefinition(settings.displayLanguage).invitationEmailSubject;
}

export function formatEmployeeName(employee: EmployeeNameParts, settings = get(localization)): string {
	const fallbackOrder = languageDefinition(settings.displayLanguage).employeeNameFallbackOrder as PersonNameOrder;
	return formatPersonName(employee, fallbackOrder);
}

export function formatLengthOfService(
	value: { years: number; months: number },
	settings = get(localization)
): string {
	const definition = languageDefinition(settings.displayLanguage);
	const formatUnit = (amount: number, unit: 'year' | 'month') => {
		const formatted = new Intl.NumberFormat(definition.locale, {
			style: 'unit', unit, unitDisplay: 'long'
		}).format(amount);
		return definition.removeDurationUnitSpacing ? formatted.replace(/\s+/gu, '') : formatted;
	};
	return [formatUnit(value.years, 'year'), formatUnit(value.months, 'month')].join(definition.durationPartSeparator);
}

function dateOnly(value: string): Date | null {
	const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
	if (!match) return null;
	const [, yearText, monthText, dayText] = match;
	const year = Number(yearText);
	const month = Number(monthText);
	const day = Number(dayText);
	const date = new Date(Date.UTC(year, month - 1, day));
	return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : null;
}

export function formatDate(value: string | null | undefined, settings = get(localization)): string {
	if (!value) return '';
	const date = dateOnly(value);
	if (!date) return '';
	return new Intl.DateTimeFormat(locale(settings), {
		timeZone: 'UTC', dateStyle: 'medium'
	}).format(date);
}

export function formatMonthYear(year: number, month: number, settings = get(localization)): string {
	const date = new Date(Date.UTC(year, month, 1));
	if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month) return '';
	return new Intl.DateTimeFormat(locale(settings), {
		timeZone: 'UTC', year: 'numeric', month: 'long'
	}).format(date);
}

export function formatTimestamp(value: string | null | undefined, settings = get(localization)): string {
	if (!value) return '';
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return '';
	return new Intl.DateTimeFormat(locale(settings), {
		timeZone: settings.timeZone, dateStyle: 'medium', timeStyle: 'short'
	}).format(date);
}
