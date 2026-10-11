import { requireBranchAccess } from '$lib/server/api/branch-access';
import { permissionOperations } from '$lib/server/auth/permissions';
import { convertAmount, financialSettings, monthKey, parseAmount, parseYear, periodMonths, roundedAmount, type Currency } from '$lib/server/api/financial';
import { failure, success } from '$lib/server/api/response';
import { Prisma } from '$lib/server/generated/prisma/client';
import { getPrisma } from '$lib/server/prisma';

type PreviewMonth = { month: string; currency: Currency; revenue: string | null; variableCost: string | null; fixedCost: string | null };

function parseMonths(value: unknown, expected: string[], currency: Currency): PreviewMonth[] | null {
	if (!Array.isArray(value) || value.length !== 12) return null;
	const months: PreviewMonth[] = [];
	for (let index = 0; index < 12; index += 1) {
		const row = value[index];
		if (!row || typeof row !== 'object') return null;
		const item = row as Record<string, unknown>;
		if (item.month !== expected[index] || ('currency' in item && item.currency !== currency)) return null;
		const blank = item.revenue === null && item.variableCost === null && item.fixedCost === null;
		if (!blank && (!parseAmount(item.revenue, currency) || !parseAmount(item.variableCost, currency) || !parseAmount(item.fixedCost, currency))) return null;
		months.push({ month: item.month as string, currency,
			revenue: blank ? null : item.revenue as string,
			variableCost: blank ? null : item.variableCost as string,
			fixedCost: blank ? null : item.fixedCost as string });
	}
	return months;
}

export async function POST({ locals, params, request }: import('./$types').RequestEvent) {
	const branchId = Number(params.branchId);
	const year = parseYear(params.year);
	if (!Number.isSafeInteger(branchId) || branchId < 1 || year === null) return failure(422, 'INVALID_PERIOD', 'Invalid branch or year.');
	requireBranchAccess(locals.user, permissionOperations.branchManagement, branchId);
	const settings = await financialSettings();
	const dates = periodMonths(year, settings);
	const body = await request.json().catch(() => null) as Record<string, unknown> | null;
	if (body?.basis !== settings.basis || body?.fiscalStartMonth !== settings.fiscalStartMonth) return failure(409, 'PERIOD_SETTINGS_CHANGED', 'Year settings changed. Reload before previewing.');
	const currency = body?.currency;
	if (currency !== 'JPY' && currency !== 'USD') return failure(400, 'INVALID_CURRENCY', 'Unsupported currency.');
	const displayCurrency = body?.displayCurrency;
	if (displayCurrency !== 'JPY' && displayCurrency !== 'USD') return failure(400, 'INVALID_CURRENCY', 'Unsupported display currency.');
	const months = parseMonths(body?.months, dates.map(monthKey), currency);
	if (!months) return failure(400, 'VALIDATION_ERROR', 'Provide all 12 months with complete amounts or empty months.');
	const branch = await getPrisma().branch.findFirst({ where: { id: branchId, deletedAt: null }, select: { id: true } });
	if (!branch) return failure(404, 'BRANCH_NOT_FOUND', 'Branch not found.');
	const conversionDates = dates.filter((_, index) => months[index].revenue !== null && currency !== displayCurrency);
	const rates = conversionDates.length ? await getPrisma().financialExchangeRate.findMany({
		where: { month: { in: conversionDates }, baseCurrency: 'USD', quoteCurrency: 'JPY', deletedAt: null },
		select: { month: true, rate: true }
	}) : [];
	const rateMap = new Map(rates.map((rate) => [monthKey(rate.month), rate.rate]));
	const missingMonths = conversionDates.map(monthKey).filter((month) => !rateMap.has(month));
	if (missingMonths.length) return failure(422, 'EXCHANGE_RATE_UNAVAILABLE', 'Monthly exchange rates are not available for every month.', missingMonths.map((month) => ({ field: month, reason: 'Exchange rate unavailable.' })));
	const totals = { revenue: new Prisma.Decimal(0), variableCost: new Prisma.Decimal(0), fixedCost: new Prisma.Decimal(0) };
	for (const row of months) {
		if (row.revenue === null) continue;
		const rate = rateMap.get(row.month) ?? null;
		totals.revenue = totals.revenue.add(convertAmount(new Prisma.Decimal(row.revenue), row.currency, displayCurrency, rate)!);
		totals.variableCost = totals.variableCost.add(convertAmount(new Prisma.Decimal(row.variableCost!), row.currency, displayCurrency, rate)!);
		totals.fixedCost = totals.fixedCost.add(convertAmount(new Prisma.Decimal(row.fixedCost!), row.currency, displayCurrency, rate)!);
	}
	const revenue = roundedAmount(totals.revenue, displayCurrency);
	const variableCost = roundedAmount(totals.variableCost, displayCurrency);
	const fixedCost = roundedAmount(totals.fixedCost, displayCurrency);
	const netProfit = new Prisma.Decimal(revenue).sub(variableCost).sub(fixedCost).toFixed(displayCurrency === 'JPY' ? 0 : 2);
	return success({ year, currency: displayCurrency, completedMonths: months.filter((row) => row.revenue !== null).length, revenue, variableCost, fixedCost, netProfit });
}
