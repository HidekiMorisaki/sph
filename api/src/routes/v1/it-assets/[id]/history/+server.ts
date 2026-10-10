import { requireOperationApi } from '$lib/server/api/admin';
import { assetBranchWhere, requireScopedOperationApi } from '$lib/server/api/branch-access';
import { permissionOperations } from '$lib/server/auth/permissions';
import { parseId } from '$lib/server/api/database';
import { listMeta, parseListQuery } from '$lib/server/api/query';
import { failure, success } from '$lib/server/api/response';
import { getPrisma } from '$lib/server/prisma';

const sortFields = ['changedAt', 'id'] as const;

export async function GET({ params, locals, url }: import('./$types').RequestEvent) {
	const { branchId } = requireScopedOperationApi(locals.user, permissionOperations.assetRead);
	const assetId = parseId(params.id);
	if (!assetId) return failure(404, 'NOT_FOUND', 'Not found.');
	const query = parseListQuery(url, sortFields, 'changedAt');
	const prisma = getPrisma();
	if (!await prisma.itAsset.count({ where: { id: assetId, deletedAt: null, ...assetBranchWhere(branchId) } })) return failure(404, 'NOT_FOUND', 'Not found.');
	const where = { assetId, deletedAt: null };
	const [total, items] = await prisma.$transaction([
		prisma.itAssetChangeHistory.count({ where }),
		prisma.itAssetChangeHistory.findMany({ where, select: {
			id: true, action: true, changes: true, changedAt: true,
			actor: { select: { firstName: true, middleName: true, lastName: true } }
		}, orderBy: [{ [query.sortBy]: query.sortOrder }, { id: 'desc' }], skip: query.offset, take: query.limit })
	]);
	return success(items.map(item => ({
		id: item.id,
		action: item.action,
		changes: item.changes,
		changedAt: item.changedAt,
		actor: item.actor
	})), 200, listMeta(query, items.length, total));
}
