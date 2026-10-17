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
	let result;
	try {
		result = await getPrisma().$transaction(async (tx) => {
			const existing = await tx.financialPeriodSetting.findUnique({ where: { key: 'main' } });
			const previous = existing && !existing.deletedAt ? existing : DEFAULT_PERIOD_SETTINGS;
			const changed = previous.basis !== basis || previous.fiscalStartMonth !== fiscalStartMonth;
			if (changed && body.confirmUnpublish !== true) return null;
			if (changed) {
				const publications = await tx.financialPublication.findMany({ where: { published: true, deletedAt: null }, select: { id: true } });
				if (publications.length) {
					await tx.financialPublication.updateMany({ where: { published: true, deletedAt: null }, data: { published: false, publishedAt: null } });
					await tx.auditLog.createMany({ data: publications.map(({ id }) => ({ actorId: actor.id, action: 'unpublish', resource: 'financial_publication', resourceId: id, detail: { reason: 'financial_period_settings_changed' } })) });
				}
			}
			const item = existing
				? await tx.financialPeriodSetting.update({ where: { id: existing.id }, data: { basis, fiscalStartMonth, deletedAt: null } })
				: await tx.financialPeriodSetting.create({ data: { key: 'main', basis, fiscalStartMonth } });
			await writeAuditLog(tx, actor.id, 'update', 'financial_period_setting', item.id, { basis, fiscalStartMonth });
			return { basis, fiscalStartMonth };
		}, { isolationLevel: 'Serializable', timeout: 30000 });
	} catch (error) {
		if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2034') return failure(409, 'STALE_FINANCIAL_DATA', 'Financial data changed. Reload and try again.');
		throw error;
	}
	return result ? success(result) : failure(409, 'CONFIRMATION_REQUIRED', 'Confirm that changing year settings will unpublish all financial periods.');
}
