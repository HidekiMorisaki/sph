import type { RequestHandler } from './$types';
import { requireScopedOperationApi, assetBranchWhere } from '$lib/server/api/branch-access';
import { assetSummaryDate, unassignedAssetWhere } from '$lib/server/api/it-asset-summary';
import { success } from '$lib/server/api/response';
import { getPrisma } from '$lib/server/prisma';
import { permissionOperations } from '$lib/server/auth/permissions';

export const GET: RequestHandler = async ({ locals, setHeaders }) => {
	const { branchId } = requireScopedOperationApi(locals.user, permissionOperations.assetRead);
	const asOf = assetSummaryDate();
	const data = await getPrisma().$transaction(async tx => {
		const groups = await tx.itAsset.groupBy({ by: ['typeId', 'storageId'], where: { AND: [unassignedAssetWhere(asOf), assetBranchWhere(branchId)] }, _count: { _all: true } });
		const types = await tx.itAssetType.findMany({ where: { id: { in: [...new Set(groups.map(row => row.typeId))] } }, select: { id: true, name: true }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] });
		const storages = await tx.storage.findMany({ where: { id: { in: [...new Set(groups.map(row => row.storageId))] } }, select: { id: true, branchId: true } });
		const branches = await tx.branch.findMany({ where: { id: { in: [...new Set(storages.map(row => row.branchId))] } }, select: { id: true, name: true }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] });
		const storageBranches = new Map(storages.map(row => [row.id, row.branchId]));
		const typeCounts = new Map<number, number>(), branchCounts = new Map<number, number>();
		let total = 0;
		for (const row of groups) {
			const count = row._count._all, branch = storageBranches.get(row.storageId)!;
			total += count;
			typeCounts.set(row.typeId, (typeCounts.get(row.typeId) ?? 0) + count);
			branchCounts.set(branch, (branchCounts.get(branch) ?? 0) + count);
		}
		return { asOf: asOf.toISOString().slice(0, 10), scope: branchId === null ? 'global' : 'own_branch', branchId, total,
			types: types.map(row => ({ ...row, count: typeCounts.get(row.id) ?? 0 })), branches: branches.map(row => ({ ...row, count: branchCounts.get(row.id) ?? 0 })) };
	}, { isolationLevel: 'RepeatableRead' });
	setHeaders({ 'cache-control': 'private, no-store' });
	return success(data);
};
