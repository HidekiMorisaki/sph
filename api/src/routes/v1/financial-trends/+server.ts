import { requireAuthenticatedApi } from '$lib/server/api/admin';
import { convertAmount, financialSettings, monthKey, parseYear, periodMonths, roundedAmount, type Currency } from '$lib/server/api/financial';
import { failure, success } from '$lib/server/api/response';
import { Prisma } from '$lib/server/generated/prisma/client';
import { getPrisma } from '$lib/server/prisma';

export async function GET({ locals, url }: import('./$types').RequestEvent) {
	const actor = requireAuthenticatedApi(locals.user);
	const startYear = parseYear(url.searchParams.get('startYear'));
	const endYear = parseYear(url.searchParams.get('endYear'));
	if (startYear === null || endYear === null || startYear > endYear) return failure(422, 'INVALID_PERIOD', 'Select a valid year range between 1980 and 2100.');
	const requestedCurrency = url.searchParams.get('currency') ?? actor.displayCurrency;
	if (requestedCurrency !== 'JPY' && requestedCurrency !== 'USD') return failure(422, 'INVALID_CURRENCY', 'Unsupported currency.');
	const currency: Currency = requestedCurrency;
	const settings = await financialSettings();
	const publications = await getPrisma().financialPublication.findMany({
		where: { basis: settings.basis, fiscalStartMonth: settings.fiscalStartMonth, year: { gte: startYear, lte: endYear }, published: true, deletedAt: null },
		select: { branchId: true, year: true, branch: { select: { name: true, sortOrder: true } } }
	});
	const branchSortOrders = new Map(publications.map((item) => [item.branchId, item.branch.sortOrder]));
	const firstMonth = periodMonths(startYear, settings)[0];
	const lastMonth = periodMonths(endYear, settings)[11];
	const branchIds = [...new Set(publications.map((item) => item.branchId))];
	const [months, rates] = branchIds.length ? await Promise.all([
		getPrisma().financialMonth.findMany({ where: { branchId: { in: branchIds }, month: { gte: firstMonth, lte: lastMonth }, deletedAt: null }, select: { branchId: true, month: true, currency: true, revenue: true, variableCost: true, fixedCost: true } }),
		getPrisma().financialExchangeRate.findMany({ where: { month: { gte: firstMonth, lte: lastMonth }, baseCurrency: 'USD', quoteCurrency: 'JPY', deletedAt: null }, select: { month: true, rate: true } })
	]) : [[], []];
	const monthsByBranch = new Map<number, Map<string, (typeof months)[number]>>();
	for (const item of months) {
		if (!monthsByBranch.has(item.branchId)) monthsByBranch.set(item.branchId, new Map());
		monthsByBranch.get(item.branchId)!.set(monthKey(item.month), item);
	}
	const rateMap = new Map(rates.map((item) => [monthKey(item.month), item.rate]));
	const rows = publications.map((publication) => {
		const entries = monthsByBranch.get(publication.branchId);
		const branch = { revenue: new Prisma.Decimal(0), variableCost: new Prisma.Decimal(0), fixedCost: new Prisma.Decimal(0) };
		let unavailable = false;
		for (const date of periodMonths(publication.year, settings)) {
			const key = monthKey(date), entry = entries?.get(key);
			if (!entry) { unavailable = true; break; }
			const rate = rateMap.get(key) ?? null;
			const revenue = convertAmount(entry.revenue, entry.currency as Currency, currency, rate);
			const variableCost = convertAmount(entry.variableCost, entry.currency as Currency, currency, rate);
			const fixedCost = convertAmount(entry.fixedCost, entry.currency as Currency, currency, rate);
			if (revenue === null || variableCost === null || fixedCost === null) { unavailable = true; break; }
			branch.revenue = branch.revenue.add(revenue);
			branch.variableCost = branch.variableCost.add(variableCost);
			branch.fixedCost = branch.fixedCost.add(fixedCost);
		}
		const revenue = unavailable ? null : roundedAmount(branch.revenue, currency);
		const variableCost = unavailable ? null : roundedAmount(branch.variableCost, currency);
		const fixedCost = unavailable ? null : roundedAmount(branch.fixedCost, currency);
		return { branchId: publication.branchId, branchName: publication.branch.name,
			year: publication.year, branchCount: 1, unavailable, revenue, variableCost, fixedCost,
			netProfit: unavailable ? null : roundedAmount(new Prisma.Decimal(revenue!).sub(variableCost!).sub(fixedCost!), currency) };
	});
	const rowsByYear = new Map<number, typeof rows>();
	const branchesById = new Map<number, { branchId: number; branchName: string; data: typeof rows }>();
	for (const row of rows) {
		if (!rowsByYear.has(row.year)) rowsByYear.set(row.year, []);
		rowsByYear.get(row.year)!.push(row);
		if (!branchesById.has(row.branchId)) branchesById.set(row.branchId, { branchId: row.branchId, branchName: row.branchName, data: [] });
		branchesById.get(row.branchId)!.data.push(row);
	}
	const totals = [];
	for (let year = startYear; year <= endYear; year += 1) {
		const selected = rowsByYear.get(year) ?? [];
		const annual = { revenue: new Prisma.Decimal(0), variableCost: new Prisma.Decimal(0), fixedCost: new Prisma.Decimal(0) };
		const unavailable = selected.some((row) => row.unavailable);
		if (!unavailable) for (const row of selected) {
			annual.revenue = annual.revenue.add(row.revenue!);
			annual.variableCost = annual.variableCost.add(row.variableCost!);
			annual.fixedCost = annual.fixedCost.add(row.fixedCost!);
		}
		const available = selected.length > 0 && !unavailable;
		totals.push({ year, branchCount: selected.length, unavailable,
			revenue: available ? roundedAmount(annual.revenue, currency) : null,
			variableCost: available ? roundedAmount(annual.variableCost, currency) : null,
			fixedCost: available ? roundedAmount(annual.fixedCost, currency) : null,
			netProfit: available ? roundedAmount(annual.revenue.sub(annual.variableCost).sub(annual.fixedCost), currency) : null });
	}
	const branches = [...branchesById.values()].sort((left, right) => branchSortOrders.get(left.branchId)! - branchSortOrders.get(right.branchId)! || left.branchId - right.branchId);
	return success({ totals, branches }, 200, { startYear, endYear, currency, basis: settings.basis, fiscalStartMonth: settings.fiscalStartMonth });
}
