import { writeAuditLog } from '$lib/server/api/admin';
import { getPrisma } from '$lib/server/prisma';
import { isItAssetMasterResource, type ItAssetMasterResource } from '$lib/server/api/it-asset-masters';
import { parseWorkforceOrder } from '$lib/server/api/workforce-order';

export const isItAssetOrderResource = isItAssetMasterResource;
export const parseItAssetOrder = parseWorkforceOrder;
export class ItAssetOrderConflictError extends Error {}

export async function reorderItAssetMasters(resource: ItAssetMasterResource, expectedIds: number[], orderedIds: number[], actorId: number) {
	return getPrisma().$transaction(async (tx) => {
		const where = { deletedAt: null };
		const orderBy = [{ sortOrder: 'asc' as const }, { id: 'asc' as const }];
		const rows = resource === 'it-asset-types' ? await tx.itAssetType.findMany({ where, orderBy, select: { id: true, sortOrder: true } })
			: resource === 'manufacturers' ? await tx.manufacturer.findMany({ where, orderBy, select: { id: true, sortOrder: true } })
			: resource === 'cpu-types' ? await tx.cpuType.findMany({ where, orderBy, select: { id: true, sortOrder: true } })
			: resource === 'operating-system-vendors' ? await tx.operatingSystemVendor.findMany({ where, orderBy, select: { id: true, sortOrder: true } })
			: resource === 'operating-systems' ? await tx.operatingSystem.findMany({ where, orderBy, select: { id: true, sortOrder: true } })
			: await tx.itAssetStatus.findMany({ where, orderBy, select: { id: true, sortOrder: true } });
		if (rows.length !== expectedIds.length || rows.some((row, index) => row.id !== expectedIds[index])) throw new ItAssetOrderConflictError();
		for (const [index, id] of orderedIds.entries()) {
			const sortOrder = index + 1;
			if (rows.find((row) => row.id === id)?.sortOrder === sortOrder) continue;
			const data = { sortOrder };
			const result = resource === 'it-asset-types' ? await tx.itAssetType.updateMany({ where: { id, deletedAt: null }, data })
				: resource === 'manufacturers' ? await tx.manufacturer.updateMany({ where: { id, deletedAt: null }, data })
				: resource === 'cpu-types' ? await tx.cpuType.updateMany({ where: { id, deletedAt: null }, data })
				: resource === 'operating-system-vendors' ? await tx.operatingSystemVendor.updateMany({ where: { id, deletedAt: null }, data })
				: resource === 'operating-systems' ? await tx.operatingSystem.updateMany({ where: { id, deletedAt: null }, data })
				: await tx.itAssetStatus.updateMany({ where: { id, deletedAt: null }, data });
			if (result.count !== 1) throw new ItAssetOrderConflictError();
			await writeAuditLog(tx, actorId, 'update', resource, id);
		}
		return orderedIds;
	}, { isolationLevel: 'Serializable' });
}
