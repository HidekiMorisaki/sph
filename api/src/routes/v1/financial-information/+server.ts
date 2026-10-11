import { requireScopedOperationApi } from '$lib/server/api/branch-access';
import { permissionOperations } from '$lib/server/auth/permissions';
import { convertAmount, financialSettings, monthKey, parseYear, periodMonths, roundedAmount, type Currency } from '$lib/server/api/financial';
import { listMeta, parseListQuery } from '$lib/server/api/query';
import { failure, success } from '$lib/server/api/response';
import { Prisma } from '$lib/server/generated/prisma/client';
import { getPrisma } from '$lib/server/prisma';

const sortFields = ['branchName', 'id'] as const;

export async function GET({ locals, url }: import('./$types').RequestEvent) {
	const { actor, branchId } = requireScopedOperationApi(locals.user, permissionOperations.branchManagement);
	const year = parseYear(url.searchParams.get('year'));
	if (year === null) return failure(422, 'INVALID_YEAR', 'Select a year between 1980 and 2100.');
	const requestedCurrency = url.searchParams.get('currency') ?? actor.displayCurrency;
	if (requestedCurrency !== 'JPY' && requestedCurrency !== 'USD') return failure(422, 'INVALID_CURRENCY', 'Unsupported currency.');
	const currency: Currency = requestedCurrency;
	const query = parseListQuery(url, sortFields, 'branchName');
	const settings = await financialSettings();
	const dates = periodMonths(year, settings);
	const branchWhere: Prisma.BranchWhereInput = { ...(branchId === null ? {} : { id: branchId }), OR: [
		{ deletedAt: null },
		{ financialMonths: { some: { month: { in: dates }, deletedAt: null } } },
		{ financialPublications: { some: { basis: settings.basis, fiscalStartMonth: settings.fiscalStartMonth, year, deletedAt: null } } }
	] };
	const [total, branches, rates] = await Promise.all([
		getPrisma().branch.count({ where: branchWhere }),
		getPrisma().branch.findMany({
			where: branchWhere,
			select: { id: true, name: true, deletedAt: true,
				financialMonths: { where: { month: { in: dates }, deletedAt: null }, select: { month: true, currency: true, revenue: true, variableCost: true, fixedCost: true } },
				financialPublications: { where: { basis: settings.basis, fiscalStartMonth: settings.fiscalStartMonth, year, deletedAt: null }, select: { published: true } }
			},
			orderBy: query.sortBy === 'branchName' ? [{ name: query.sortOrder }, { id: 'asc' }] : [{ id: query.sortOrder }],
			skip: query.offset, take: query.limit
		}),
		getPrisma().financialExchangeRate.findMany({ where: { month: { in: dates }, baseCurrency: 'USD', quoteCurrency: 'JPY', deletedAt: null }, select: { month: true, rate: true } })
	]);
	const rateMap = new Map(rates.map((rate) => [monthKey(rate.month), rate.rate]));
	const items = branches.map((branch) => {
		const totals = { revenue: new Prisma.Decimal(0), variableCost: new Prisma.Decimal(0), fixedCost: new Prisma.Decimal(0) };
		const missingRates: string[] = [];
		for (const entry of branch.financialMonths) {
			const rate = rateMap.get(monthKey(entry.month)) ?? null;
			const converted = convertAmount(entry.revenue, entry.currency as Currency, currency, rate);
			if (converted === null) { missingRates.push(monthKey(entry.month)); continue; }
			totals.revenue = totals.revenue.add(converted);
			totals.variableCost = totals.variableCost.add(convertAmount(entry.variableCost, entry.currency as Currency, currency, rate)!);
			totals.fixedCost = totals.fixedCost.add(convertAmount(entry.fixedCost, entry.currency as Currency, currency, rate)!);
		}
		const valid = branch.financialMonths.length > 0 && missingRates.length === 0;
		const revenue = valid ? roundedAmount(totals.revenue, currency) : null;
		const variableCost = valid ? roundedAmount(totals.variableCost, currency) : null;
		const fixedCost = valid ? roundedAmount(totals.fixedCost, currency) : null;
		const netProfit = valid ? new Prisma.Decimal(revenue!).sub(variableCost!).sub(fixedCost!).toFixed(currency === 'JPY' ? 0 : 2) : null;
		return { branchId: branch.id, branchName: branch.name, branchDeleted: Boolean(branch.deletedAt), year, currency,
			completedMonths: branch.financialMonths.length, missingRates,
			revenue, variableCost, fixedCost, netProfit,
			published: branch.financialPublications[0]?.published ?? false };
	});
	return success(items, 200, { ...listMeta(query, items.length, total), basis: settings.basis, fiscalStartMonth: settings.fiscalStartMonth,
		periodStart: monthKey(dates[0]), periodEnd: monthKey(dates[11]) });
}
