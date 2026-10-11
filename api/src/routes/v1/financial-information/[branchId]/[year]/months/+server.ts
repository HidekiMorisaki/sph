import { requireSystemAdminApi, writeAuditLog } from '$lib/server/api/admin';
import { requireBranchAccess } from '$lib/server/api/branch-access';
import { permissionOperations } from '$lib/server/auth/permissions';
import { financialSettings, monthKey, parseAmount, parseYear, periodMonths, periodYearForMonth, type Currency } from '$lib/server/api/financial';
import { failure, success } from '$lib/server/api/response';
import { getPrisma } from '$lib/server/prisma';

type SubmittedMonth = { month: string; currency: Currency; revenue: string | null; variableCost: string | null; fixedCost: string | null; version: number | null };

function input(value: unknown, expectedMonths: string[], currency: Currency): SubmittedMonth[] | null {
	if (!value || typeof value !== 'object' || !Array.isArray((value as { months?: unknown }).months)) return null;
	const rows = (value as { months: unknown[] }).months;
	if (rows.length !== 12) return null;
	const parsed: SubmittedMonth[] = [];
	for (let index = 0; index < 12; index += 1) {
		const row = rows[index];
		if (!row || typeof row !== 'object') return null;
		const item = row as Record<string, unknown>;
		if (item.month !== expectedMonths[index] || ('currency' in item && item.currency !== currency)) return null;
		if (item.version !== null && (!Number.isSafeInteger(item.version) || Number(item.version) < 1)) return null;
		const blank = item.revenue === null && item.variableCost === null && item.fixedCost === null;
		if (!blank && (!parseAmount(item.revenue, currency) || !parseAmount(item.variableCost, currency) || !parseAmount(item.fixedCost, currency))) return null;
		parsed.push({ month: item.month, currency, revenue: blank ? null : item.revenue as string, variableCost: blank ? null : item.variableCost as string, fixedCost: blank ? null : item.fixedCost as string, version: item.version as number | null });
	}
	return parsed;
}

export async function GET({ locals, params }: import('./$types').RequestEvent) {
	const branchId = Number(params.branchId);
	const year = parseYear(params.year);
	if (!Number.isSafeInteger(branchId) || branchId < 1 || year === null) return failure(422, 'INVALID_PERIOD', 'Invalid branch or year.');
	const actor = requireBranchAccess(locals.user, permissionOperations.branchManagement, branchId);
	const settings = await financialSettings();
	const dates = periodMonths(year, settings);
	const branch = await getPrisma().branch.findFirst({ where: { id: branchId, deletedAt: null }, select: { id: true, name: true } });
	if (!branch) return failure(404, 'BRANCH_NOT_FOUND', 'Branch not found.');
	const entries = await getPrisma().financialMonth.findMany({ where: { branchId, month: { in: dates }, deletedAt: null } });
	const byMonth = new Map(entries.map((entry) => [monthKey(entry.month), entry]));
	return success({ branch, year, basis: settings.basis, fiscalStartMonth: settings.fiscalStartMonth,
		currency: dates.map((date) => byMonth.get(monthKey(date))?.currency).find((value) => value !== undefined) ?? actor.displayCurrency,
		months: dates.map((date) => {
			const entry = byMonth.get(monthKey(date));
			return { month: monthKey(date),
				revenue: entry?.revenue.toString() ?? null, variableCost: entry?.variableCost.toString() ?? null, fixedCost: entry?.fixedCost.toString() ?? null,
				version: entry?.version ?? null };
		}) });
}

export async function PUT({ locals, params, request }: import('./$types').RequestEvent) {
	const branchId = Number(params.branchId);
	const year = parseYear(params.year);
	if (!Number.isSafeInteger(branchId) || branchId < 1 || year === null) return failure(422, 'INVALID_PERIOD', 'Invalid branch or year.');
	const actor = requireBranchAccess(locals.user, permissionOperations.branchManagement, branchId);
	const settings = await financialSettings();
	const dates = periodMonths(year, settings);
	const body = await request.json().catch(() => null) as Record<string, unknown> | null;
	const currency = body?.currency;
	if (currency !== 'JPY' && currency !== 'USD') return failure(400, 'INVALID_CURRENCY', 'Unsupported currency.');
	const rows = input(body, dates.map(monthKey), currency);
	if (!rows) return failure(400, 'VALIDATION_ERROR', 'Provide all 12 months with complete amounts or empty months.');
	if (body?.basis !== settings.basis || body?.fiscalStartMonth !== settings.fiscalStartMonth) return failure(409, 'PERIOD_SETTINGS_CHANGED', 'Year settings changed. Reload before saving.');
	try {
		const changed = await getPrisma().$transaction(async (tx) => {
			const currentSettings = await tx.financialPeriodSetting.findUnique({ where: { key: 'main' }, select: { basis: true, fiscalStartMonth: true, deletedAt: true } });
			if (currentSettings && !currentSettings.deletedAt && (currentSettings.basis !== settings.basis || currentSettings.fiscalStartMonth !== settings.fiscalStartMonth)) throw new Error('CONFLICT');
			if (!await tx.branch.count({ where: { id: branchId, deletedAt: null } })) throw new Error('BRANCH_NOT_FOUND');
			const affected: Date[] = [];
			for (let index = 0; index < 12; index += 1) {
				const row = rows[index];
				const date = dates[index];
				const existing = await tx.financialMonth.findUnique({ where: { branchId_month: { branchId, month: date } } });
				if (existing && !existing.deletedAt ? row.version !== existing.version : row.version !== null) throw new Error('CONFLICT');
				if (existing && !existing.deletedAt && row.revenue !== null && existing.currency !== currency) throw new Error('CURRENCY_LOCKED');
				if (row.revenue === null) {
					if (existing && !existing.deletedAt) {
						await tx.financialMonth.update({ where: { id: existing.id }, data: { deletedAt: new Date(), version: { increment: 1 } } });
						affected.push(date);
						await writeAuditLog(tx, actor.id, 'remove', 'financial_month', existing.id);
					}
					continue;
				}
				const data = { currency: row.currency, revenue: row.revenue, variableCost: row.variableCost!, fixedCost: row.fixedCost! };
				const unchanged = existing && !existing.deletedAt && existing.currency === row.currency
					&& existing.revenue.equals(row.revenue) && existing.variableCost.equals(row.variableCost!) && existing.fixedCost.equals(row.fixedCost!);
				if (unchanged) continue;
				const item = existing
					? await tx.financialMonth.update({ where: { id: existing.id }, data: { ...data, deletedAt: null, version: { increment: 1 } } })
					: await tx.financialMonth.create({ data: { branchId, month: date, ...data } });
				affected.push(date);
				await writeAuditLog(tx, actor.id, existing ? 'update' : 'create', 'financial_month', item.id);
			}
			for (const date of affected) {
				const where = { branchId, published: true, deletedAt: null, OR: [
					{ basis: 'calendar', year: date.getUTCFullYear() },
					{ basis: 'fiscal', fiscalStartMonth: settings.fiscalStartMonth, year: periodYearForMonth(date, 'fiscal', settings.fiscalStartMonth) }
				] };
				const publications = await tx.financialPublication.findMany({ where, select: { id: true } });
				for (const publication of publications) {
					await tx.financialPublication.update({ where: { id: publication.id }, data: { published: false, publishedAt: null } });
					await writeAuditLog(tx, actor.id, 'unpublish', 'financial_publication', publication.id, { reason: 'financial_month_changed' });
				}
			}
			return affected.length;
		}, { isolationLevel: 'Serializable' });
		return success({ changedMonths: changed });
	} catch (error) {
		if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2034') return failure(409, 'STALE_FINANCIAL_DATA', 'Financial data changed. Reload before saving.');
		if (error instanceof Error && error.message === 'CONFLICT') return failure(409, 'STALE_FINANCIAL_DATA', 'Financial data changed. Reload before saving.');
		if (error instanceof Error && error.message === 'CURRENCY_LOCKED') return failure(409, 'CURRENCY_LOCKED', 'Clear all entered months before changing the input currency.');
		if (error instanceof Error && error.message === 'BRANCH_NOT_FOUND') return failure(404, 'BRANCH_NOT_FOUND', 'Branch not found.');
		throw error;
	}
}
