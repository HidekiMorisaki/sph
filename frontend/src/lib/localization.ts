import { localeMessages, loadActiveLocale, formatLocaleTemplate, type MessageLanguage } from '$lib/locale-messages';
import { get, writable, type Writable } from 'svelte/store';
import { getContext } from 'svelte';
import { browser } from '$app/environment';
import { productName } from '$lib/brand';
import { formatPersonName, type PersonNameOrder, type PersonNameParts } from '$lib/person-name';
import type { FinancialCurrency } from '$lib/financial-currency';

export const GENDER_VALUES = ['female', 'male', 'unspecified'] as const;
export type GenderValue = (typeof GENDER_VALUES)[number];

type CalendarText = {
	required: string; calendar: string; previousYears: string; nextYears: string;
	backToCalendar: string; previousYear: string; previousMonth: string; chooseYear: string;
	nextMonth: string; nextYear: string; clear: string; today: string;
	chooseYearLabel: (year: number) => string;
};
type WeekdayLabels = readonly [string, string, string, string, string, string, string];
type LanguageDefinition = {
	value: string; label: string; locale: string; employeeNameFallbackOrder: PersonNameOrder;
	durationPartSeparator: string; removeDurationUnitSpacing: boolean;
	genderLabels: Record<GenderValue, string>; invitationEmailSubject: string;
	weekdays: { compact: WeekdayLabels; short: WeekdayLabels };
	calendarText: CalendarText;
};

function weekdayTuple(labels: readonly string[]): WeekdayLabels {
	if (labels.length !== 7) throw new Error('A calendar requires seven weekday labels.');
	return [labels[0], labels[1], labels[2], labels[3], labels[4], labels[5], labels[6]];
}

function defineLanguage<Language extends MessageLanguage>(value: Language) {
	const messages = localeMessages[value];
	const order = messages.language.employeeNameFallbackOrder;
	if (order !== 'givenFirst' && order !== 'surnameFirst') throw new Error('Invalid name order.');
	return {
		...messages.language, value, employeeNameFallbackOrder: order,
		invitationEmailSubject: formatLocaleTemplate(messages.language.invitationEmailSubject, productName),
		genderLabels: messages.genderLabels,
		weekdays: { compact: weekdayTuple(messages.weekdays.compact), short: weekdayTuple(messages.weekdays.short) },
		calendarText: { ...messages.calendar, chooseYearLabel: (year: number) => formatLocaleTemplate(messages.calendar.chooseYearLabel, year) }
	} satisfies LanguageDefinition;
}

export const DISPLAY_LANGUAGES = [defineLanguage('en'), defineLanguage('ja')] as const;
export type DisplayLanguage = MessageLanguage;

export type LocalizationSettings = {
	timeZone: string;
	displayLanguage: DisplayLanguage;
	displayCurrency: FinancialCurrency;
};

export type EmployeeNameParts = PersonNameParts;

export const DEFAULT_LOCALIZATION: LocalizationSettings = { timeZone: 'Asia/Tokyo', displayLanguage: 'en', displayCurrency: 'USD' };
export const LOCALIZATION_CONTEXT = Symbol('localization');
const clientLocalization = writable<LocalizationSettings>({ ...DEFAULT_LOCALIZATION });
let initialized = false;

function localizationStore(): Writable<LocalizationSettings> {
	if (!browser) {
		// SSR stores belong to the layout's component tree, never to another request.
		try {
			const scoped = getContext<Writable<LocalizationSettings> | undefined>(LOCALIZATION_CONTEXT);
			if (scoped) return scoped;
		} catch {
			// Standalone formatting outside a component uses the default store.
		}
	}
	return clientLocalization;
}
export const localization: Writable<LocalizationSettings> = {
	subscribe: (run, invalidate) => localizationStore().subscribe(run, invalidate),
	set: value => localizationStore().set(value),
	update: updater => localizationStore().update(updater)
};
export function hasInitialLocalization(): boolean { return initialized; }
export function initializeLocalization(settings: LocalizationSettings): Writable<LocalizationSettings> {
	const initial = { timeZone: settings.timeZone, displayLanguage: settings.displayLanguage, displayCurrency: settings.displayCurrency };
	if (!browser) return writable(initial);
	clientLocalization.set(initial);
	initialized = true;
	return clientLocalization;
}

let localizationRevision = 0;
export async function applyLocalization(settings: LocalizationSettings): Promise<void> {
	// Keep applied preferences independent from editable forms and session objects.
	const applied: LocalizationSettings = { timeZone: settings.timeZone, displayLanguage: settings.displayLanguage, displayCurrency: settings.displayCurrency };
	const revision = ++localizationRevision;
	await loadActiveLocale(applied.displayLanguage);
	if (revision !== localizationRevision) return;
	localization.set(applied);
	if (typeof document !== 'undefined') document.documentElement.lang = applied.displayLanguage;
}

function languageDefinition(displayLanguage: DisplayLanguage) {
	return DISPLAY_LANGUAGES.find(({ value }) => value === displayLanguage) ?? DISPLAY_LANGUAGES[0];
}

function locale(settings: LocalizationSettings): string {
	return languageDefinition(settings.displayLanguage).locale;
}

export function calendarText(settings = get(localization)): CalendarText {
	return languageDefinition(settings.displayLanguage).calendarText;
}

export function weekdayLabels(width: 'compact' | 'short' = 'short', settings = get(localization)): readonly string[] {
	return languageDefinition(settings.displayLanguage).weekdays[width];
}

export function displayLanguageOptions() {
	return DISPLAY_LANGUAGES.map(({ value, label }) => ({ value, label }));
}

export function personNameFields(settings = get(localization)) {
	return languageDefinition(settings.displayLanguage).employeeNameFallbackOrder === 'surnameFirst'
		? ['lastName', 'middleName', 'firstName'] as const
		: ['firstName', 'middleName', 'lastName'] as const;
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

export function formatDate(value: string | null | undefined, settings = get(localization), dateStyle: 'medium' | 'long' = 'medium'): string {
	if (!value) return '';
	const date = dateOnly(value);
	if (!date) return '';
	return new Intl.DateTimeFormat(locale(settings), {
		timeZone: 'UTC', dateStyle
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
