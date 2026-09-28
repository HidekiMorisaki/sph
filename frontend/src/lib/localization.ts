import { get, writable } from 'svelte/store';

export type LocalizationSettings = {
	timeZone: string;
	displayLanguage: 'en' | 'ja';
};

export const DEFAULT_LOCALIZATION: LocalizationSettings = { timeZone: 'Asia/Tokyo', displayLanguage: 'en' };
export const localization = writable<LocalizationSettings>(DEFAULT_LOCALIZATION);

export function applyLocalization(settings: LocalizationSettings): void {
	localization.set(settings);
	if (typeof document !== 'undefined') document.documentElement.lang = settings.displayLanguage;
}

function locale(settings: LocalizationSettings): string {
	return settings.displayLanguage === 'ja' ? 'ja-JP' : 'en-US';
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
