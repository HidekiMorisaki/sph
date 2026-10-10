import { writeAuditLog } from '$lib/server/api/admin';
import { parseWorkforceOrder } from '$lib/server/api/workforce-order';
import { getPrisma } from '$lib/server/prisma';

export const systemSettingOrderResources = ['roles', 'external-links'] as const;
export type SystemSettingOrderResource = (typeof systemSettingOrderResources)[number];
export const parseSystemSettingOrder = parseWorkforceOrder;
export class SystemSettingOrderConflictError extends Error {}

export function isSystemSettingOrderResource(value: string): value is SystemSettingOrderResource {
	return systemSettingOrderResources.includes(value as SystemSettingOrderResource);
}

export async function reorderSystemSettings(resource: SystemSettingOrderResource, expectedIds: number[], orderedIds: number[], actorId: number) {
	return getPrisma().$transaction(async (tx) => {
		const where = { deletedAt: null };
		const orderBy = [{ sortOrder: 'asc' as const }, { name: 'asc' as const }, { id: 'asc' as const }];
		const rows = resource === 'roles'
			? await tx.role.findMany({ where, orderBy, select: { id: true, sortOrder: true } })
			: await tx.externalLink.findMany({ where, orderBy, select: { id: true, sortOrder: true } });
		if (rows.length !== expectedIds.length || rows.some((row, index) => row.id !== expectedIds[index])) throw new SystemSettingOrderConflictError();
		for (const [index, id] of orderedIds.entries()) {
			const sortOrder = index + 1;
			if (rows.find((row) => row.id === id)?.sortOrder === sortOrder) continue;
			const historyResource = resource === 'roles' ? 'role' : 'external_link';
			const result = resource === 'roles'
				? await tx.role.updateMany({ where: { id, deletedAt: null }, data: { sortOrder } })
				: await tx.externalLink.updateMany({ where: { id, deletedAt: null }, data: { sortOrder } });
			if (result.count !== 1) throw new SystemSettingOrderConflictError();
			await writeAuditLog(tx, actorId, 'update', historyResource, id);
		}
		return orderedIds;
	}, { isolationLevel: 'Serializable' });
}
