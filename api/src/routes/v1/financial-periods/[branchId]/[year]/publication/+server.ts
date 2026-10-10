import { requireSystemAdminApi, writeAuditLog } from '$lib/server/api/admin';
import { requireBranchAccess } from '$lib/server/api/branch-access';
import { hasPermissionOperation, permissionOperations } from '$lib/server/auth/permissions';
import { ensureBojRates, financialSettings, parseYear, periodMonths } from '$lib/server/api/financial';
import { failure, success } from '$lib/server/api/response';
import { getPrisma } from '$lib/server/prisma';

export async function PUT({ locals, params, request }: import('./$types').RequestEvent) {
	const branchId = Number(params.branchId);
	const year = parseYear(params.year);
	const body = await request.json().catch(() => null) as Record<string, unknown> | null;
	if (!Number.isSafeInteger(branchId) || branchId < 1 || year === null || typeof body?.published !== 'boolean') return failure(400, 'VALIDATION_ERROR', 'Invalid publication request.');
	const actor = requireBranchAccess(locals.user, permissionOperations.branchManagement, branchId);
	const published = body.published as boolean;
	const settings = await financialSettings();
	if (body.basis !== settings.basis || body.fiscalStartMonth !== settings.fiscalStartMonth) return failure(409, 'PERIOD_SETTINGS_CHANGED', 'Year settings changed. Reload before publishing.');
	const dates = periodMonths(year, settings);
	if (published) {
		const count = await getPrisma().financialMonth.count({ where: { branchId, month: { in: dates }, deletedAt: null } });
		if (count !== 12) return failure(422, 'INCOMPLETE_PERIOD', 'All 12 months must be entered before publishing.');
		if (hasPermissionOperation(actor, permissionOperations.systemManagement)) {
			try {
				const missing = await ensureBojRates(dates);
				if (missing.length) return failure(422, 'EXCHANGE_RATE_UNAVAILABLE', 'Monthly exchange rates are not available for every month.');
			} catch {
				return failure(503, 'EXCHANGE_RATE_SERVICE_UNAVAILABLE', 'Unable to retrieve exchange rates. Try again later.');
			}
		} else {
			const available = await getPrisma().financialExchangeRate.count({ where: { month: { in: dates }, baseCurrency: 'USD', quoteCurrency: 'JPY', deletedAt: null } });
			if (available !== dates.length) return failure(422, 'EXCHANGE_RATE_UNAVAILABLE', 'Monthly exchange rates are not available for every month.');
		}
	}
	try {
		const result = await getPrisma().$transaction(async (tx) => {
			const current = await tx.financialPeriodSetting.findUnique({ where: { key: 'main' } });
			if (current && !current.deletedAt && (current.basis !== settings.basis || current.fiscalStartMonth !== settings.fiscalStartMonth)) throw new Error('CONFLICT');
			if (!await tx.branch.count({ where: { id: branchId, deletedAt: null } })) throw new Error('BRANCH_NOT_FOUND');
			if (published) {
				if (await tx.financialMonth.count({ where: { branchId, month: { in: dates }, deletedAt: null } }) !== 12) throw new Error('INCOMPLETE');
				if (await tx.financialExchangeRate.count({ where: { month: { in: dates }, baseCurrency: 'USD', quoteCurrency: 'JPY', deletedAt: null } }) !== 12) throw new Error('RATES');
			}
			const key = { branchId, basis: settings.basis, fiscalStartMonth: settings.fiscalStartMonth, year };
			const existing = await tx.financialPublication.findUnique({ where: { branchId_basis_fiscalStartMonth_year: key } });
			if (existing && existing.published === published && !existing.deletedAt) return existing;
			const data = { published, publishedAt: published ? new Date() : null, deletedAt: null };
			const item = existing
				? await tx.financialPublication.update({ where: { id: existing.id }, data })
				: await tx.financialPublication.create({ data: { ...key, ...data } });
			await writeAuditLog(tx, actor.id, published ? 'publish' : 'unpublish', 'financial_publication', item.id);
			return item;
		}, { isolationLevel: 'Serializable' });
		return success({ published: result.published });
	} catch (error) {
		if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2034') return failure(409, 'STALE_FINANCIAL_DATA', 'Financial data changed. Reload before publishing.');
		if (error instanceof Error) {
			if (error.message === 'CONFLICT') return failure(409, 'PERIOD_SETTINGS_CHANGED', 'Year settings changed. Reload before publishing.');
			if (error.message === 'BRANCH_NOT_FOUND') return failure(404, 'BRANCH_NOT_FOUND', 'Branch not found.');
			if (error.message === 'INCOMPLETE') return failure(422, 'INCOMPLETE_PERIOD', 'All 12 months must be entered before publishing.');
			if (error.message === 'RATES') return failure(422, 'EXCHANGE_RATE_UNAVAILABLE', 'Monthly exchange rates are not available for every month.');
		}
		throw error;
	}
}
