import { requireSystemAdminApi, writeAuditLog } from '$lib/server/api/admin';
import { requireScopedOperationApi } from '$lib/server/api/branch-access';
import { permissionOperations } from '$lib/server/auth/permissions';
import { DEFAULT_PERIOD_SETTINGS, financialSettings } from '$lib/server/api/financial';
import { failure, success } from '$lib/server/api/response';
import { getPrisma } from '$lib/server/prisma';

export async function GET({ locals }: import('./$types').RequestEvent) {
	requireScopedOperationApi(locals.user, permissionOperations.branchManagement);
	return success(await financialSettings());
}

export async function PATCH({ locals, request }: import('./$types').RequestEvent) {
	const actor = requireSystemAdminApi(locals.user);
	const body = await request.json().catch(() => null) as Record<string, unknown> | null;
	if (!body || (body.basis !== 'calendar' && body.basis !== 'fiscal') || !Number.isInteger(body.fiscalStartMonth) || Number(body.fiscalStartMonth) < 1 || Number(body.fiscalStartMonth) > 12) {
		return failure(400, 'VALIDATION_ERROR', 'Select a valid year basis and fiscal start month.');
	}
	const basis = body.basis;
	const fiscalStartMonth = Number(body.fiscalStartMonth);
	const result = await getPrisma().$transaction(async (tx) => {
		const existing = await tx.financialPeriodSetting.findUnique({ where: { key: 'main' } });
		const previous = existing && !existing.deletedAt ? existing : DEFAULT_PERIOD_SETTINGS;
		if (previous.fiscalStartMonth !== fiscalStartMonth && await tx.financialPublication.count({ where: { basis: 'fiscal', published: true, deletedAt: null } })) return null;
		const item = existing
			? await tx.financialPeriodSetting.update({ where: { id: existing.id }, data: { basis, fiscalStartMonth, deletedAt: null } })
			: await tx.financialPeriodSetting.create({ data: { key: 'main', basis, fiscalStartMonth } });
		await writeAuditLog(tx, actor.id, 'update', 'financial_period_setting', item.id, { basis, fiscalStartMonth });
		return { basis, fiscalStartMonth };
	}, { isolationLevel: 'Serializable' });
	return result ? success(result) : failure(409, 'PUBLISHED_FISCAL_PERIODS', 'Unpublish fiscal periods before changing the fiscal start month.');
}
