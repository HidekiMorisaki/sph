import { Prisma } from '$lib/server/generated/prisma/client';
import { getPrisma } from '$lib/server/prisma';

export type Basis = 'calendar' | 'fiscal';
export type Currency = 'JPY' | 'USD';
export type PeriodSettings = { basis: Basis; fiscalStartMonth: number };
export const DEFAULT_PERIOD_SETTINGS: PeriodSettings = { basis: 'calendar', fiscalStartMonth: 4 };
export const BOJ_SOURCE = 'BOJ FM08/FXERM07';

export function monthDate(year: number, month: number): Date { return new Date(Date.UTC(year, month - 1, 1)); }
export function monthKey(value: Date): string { return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}`; }
export function parseYear(value: unknown): number | null {
	const year = typeof value === 'string' && /^\d{4}$/.test(value) ? Number(value) : NaN;
	return Number.isInteger(year) && year >= 1980 && year <= 2100 ? year : null;
}
export function periodMonths(year: number, settings: PeriodSettings): Date[] {
	const start = settings.basis === 'calendar' ? 1 : settings.fiscalStartMonth;
	return Array.from({ length: 12 }, (_, index) => monthDate(year, start + index));
}
export function periodYearForMonth(month: Date, basis: Basis, fiscalStartMonth: number): number {
	return basis === 'calendar' || month.getUTCMonth() + 1 >= fiscalStartMonth ? month.getUTCFullYear() : month.getUTCFullYear() - 1;
}
export async function financialSettings(): Promise<PeriodSettings> {
	const item = await getPrisma().financialPeriodSetting.findUnique({ where: { key: 'main' }, select: { basis: true, fiscalStartMonth: true, deletedAt: true } });
	return item && !item.deletedAt && (item.basis === 'calendar' || item.basis === 'fiscal')
		? { basis: item.basis, fiscalStartMonth: item.fiscalStartMonth }
		: DEFAULT_PERIOD_SETTINGS;
}
export function parseAmount(value: unknown, currency: Currency): string | null {
	if (typeof value !== 'string') return null;
	const valid = currency === 'JPY' ? /^(0|[1-9]\d{0,17})$/ : /^(0|[1-9]\d{0,17})(\.\d{1,2})?$/;
	return valid.test(value) ? value : null;
}
export function convertAmount(amount: Prisma.Decimal, from: Currency, to: Currency, rate: Prisma.Decimal | null): Prisma.Decimal | null {
	if (from === to) return amount;
	if (!rate || rate.lte(0)) return null;
	return from === 'JPY' ? amount.div(rate) : amount.mul(rate);
}
export function roundedAmount(value: Prisma.Decimal, currency: Currency): string {
	return value.toDecimalPlaces(currency === 'JPY' ? 0 : 2, Prisma.Decimal.ROUND_HALF_UP).toFixed(currency === 'JPY' ? 0 : 2);
}

type BojResult = { STATUS?: number; RESULTSET?: Array<{ SERIES_CODE?: string; VALUES?: { SURVEY_DATES?: number[]; VALUES?: Array<number | string | null> } }> };
export async function fetchBojRates(months: Date[]): Promise<Map<string, string>> {
	const result = new Map<string, string>();
	if (!months.length) return result;
	const dates = [...months].sort((a, b) => a.getTime() - b.getTime());
	const params = new URLSearchParams({ format: 'json', lang: 'en', db: 'FM08', startDate: monthKey(dates[0]).replace('-', ''), endDate: monthKey(dates[dates.length - 1]).replace('-', ''), code: 'FXERM07' });
	const response = await fetch(`https://www.stat-search.boj.or.jp/api/v1/getDataCode?${params}`, { signal: AbortSignal.timeout(10000) });
	if (!response.ok) throw new Error('BOJ exchange rate service unavailable');
	const body = await response.json() as BojResult;
	if (body.STATUS !== 200) throw new Error('BOJ exchange rate service returned an error');
	const series = body.RESULTSET?.find((item) => item.SERIES_CODE === 'FXERM07');
	for (let index = 0; index < (series?.VALUES?.SURVEY_DATES?.length ?? 0); index += 1) {
		const date = String(series!.VALUES!.SURVEY_DATES![index]);
		const raw = series!.VALUES!.VALUES?.[index];
		if (!/^\d{6}$/.test(date) || raw === null || raw === undefined) continue;
		const rate = new Prisma.Decimal(String(raw));
		if (rate.gt(0)) result.set(`${date.slice(0, 4)}-${date.slice(4)}`, rate.toString());
	}
	return result;
}

export async function ensureBojRates(months: Date[]): Promise<string[]> {
	const unique = [...new Map(months.map((month) => [monthKey(month), month])).values()];
	const existing = await getPrisma().financialExchangeRate.findMany({ where: { month: { in: unique }, baseCurrency: 'USD', quoteCurrency: 'JPY', deletedAt: null }, select: { month: true } });
	const found = new Set(existing.map((item) => monthKey(item.month)));
	const missing = unique.filter((month) => !found.has(monthKey(month)));
	if (!missing.length) return [];
	const fetched = await fetchBojRates(missing);
	for (const month of missing) {
		const rate = fetched.get(monthKey(month));
		if (!rate) continue;
		await getPrisma().financialExchangeRate.upsert({
			where: { month_baseCurrency_quoteCurrency: { month, baseCurrency: 'USD', quoteCurrency: 'JPY' } },
			create: { month, baseCurrency: 'USD', quoteCurrency: 'JPY', rate, source: BOJ_SOURCE },
			update: { deletedAt: null }
		});
	}
	return missing.filter((month) => !fetched.has(monthKey(month))).map(monthKey);
}
