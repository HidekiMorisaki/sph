import { writeAuditLog } from '$lib/server/api/admin';
import { readMasterSnapshot, recordMasterChange } from '$lib/server/api/master-history';
import { getPrisma } from '$lib/server/prisma';

export const locationOrderResources = ['branches', 'rooms', 'storages'] as const;
export type LocationOrderResource = (typeof locationOrderResources)[number];

export function isLocationOrderResource(value: string): value is LocationOrderResource {
	return locationOrderResources.includes(value as LocationOrderResource);
}

export function parseLocationOrder(value: unknown): { expectedIds: number[]; orderedIds: number[] } | null {
	if (!value || typeof value !== 'object') return null;
	const { expectedIds, orderedIds } = value as Record<string, unknown>;
	const valid = (ids: unknown): ids is number[] => Array.isArray(ids) && ids.length <= 5000
		&& ids.every((id) => Number.isSafeInteger(id) && id > 0) && new Set(ids).size === ids.length;
	if (!valid(expectedIds) || !valid(orderedIds) || expectedIds.length !== orderedIds.length) return null;
	if (orderedIds.some((id) => !expectedIds.includes(id))) return null;
	return { expectedIds, orderedIds };
}

export class LocationOrderConflictError extends Error {}

export async function reorderLocations(resource: LocationOrderResource, expectedIds: number[], orderedIds: number[], actorId: number) {
	return getPrisma().$transaction(async (tx) => {
		const where = { deletedAt: null };
		const orderBy = [{ sortOrder: 'asc' as const }, { id: 'asc' as const }];
		const rows = resource === 'branches' ? await tx.branch.findMany({ where, orderBy, select: { id: true, sortOrder: true } })
			: resource === 'rooms' ? await tx.room.findMany({ where, orderBy, select: { id: true, sortOrder: true } })
			: await tx.storage.findMany({ where, orderBy, select: { id: true, sortOrder: true } });
		if (rows.length !== expectedIds.length || rows.some((row, index) => row.id !== expectedIds[index])) throw new LocationOrderConflictError();
		const historyResource = resource === 'branches' ? 'branches' : resource === 'rooms' ? 'room' : 'storage';
		for (const [index, id] of orderedIds.entries()) {
			const sortOrder = index + 1;
			if (rows.find((row) => row.id === id)?.sortOrder === sortOrder) continue;
			const before = await readMasterSnapshot(tx, historyResource, id);
			const data = { sortOrder };
			const result = resource === 'branches' ? await tx.branch.updateMany({ where: { id, deletedAt: null }, data })
				: resource === 'rooms' ? await tx.room.updateMany({ where: { id, deletedAt: null }, data })
				: await tx.storage.updateMany({ where: { id, deletedAt: null }, data });
			if (result.count !== 1) throw new LocationOrderConflictError();
			await writeAuditLog(tx, actorId, 'update', historyResource, id);
			await recordMasterChange(tx, historyResource, id, actorId, 'update', before, await readMasterSnapshot(tx, historyResource, id));
		}
		return orderedIds;
	}, { isolationLevel: 'Serializable' });
}
