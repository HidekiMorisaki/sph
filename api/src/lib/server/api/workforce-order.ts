import { writeAuditLog } from '$lib/server/api/admin';
import { readMasterSnapshot, recordMasterChange } from '$lib/server/api/master-history';
import { getPrisma } from '$lib/server/prisma';

export const workforceOrderResources = ['employment-types', 'positions', 'departments', 'employee-groups'] as const;
export type WorkforceOrderResource = (typeof workforceOrderResources)[number];

export function isWorkforceOrderResource(value: string): value is WorkforceOrderResource {
	return workforceOrderResources.includes(value as WorkforceOrderResource);
}

export function parseWorkforceOrder(value: unknown): { expectedIds: number[]; orderedIds: number[] } | null {
	if (!value || typeof value !== 'object') return null;
	const { expectedIds, orderedIds } = value as Record<string, unknown>;
	const valid = (ids: unknown): ids is number[] => Array.isArray(ids) && ids.length <= 5000
		&& ids.every((id) => Number.isSafeInteger(id) && id > 0) && new Set(ids).size === ids.length;
	if (!valid(expectedIds) || !valid(orderedIds) || expectedIds.length !== orderedIds.length) return null;
	if (orderedIds.some((id) => !expectedIds.includes(id))) return null;
	return { expectedIds, orderedIds };
}

export class WorkforceOrderConflictError extends Error {}

export async function reorderWorkforce(resource: WorkforceOrderResource, expectedIds: number[], orderedIds: number[], actorId: number) {
	return getPrisma().$transaction(async (tx) => {
		const orderBy = [{ sortOrder: 'asc' as const }, { id: 'asc' as const }];
		const where = { deletedAt: null };
		const rows = resource === 'employment-types' ? await tx.employmentType.findMany({ where, orderBy, select: { id: true, sortOrder: true } })
			: resource === 'positions' ? await tx.position.findMany({ where, orderBy, select: { id: true, sortOrder: true } })
			: resource === 'departments' ? await tx.department.findMany({ where, orderBy, select: { id: true, sortOrder: true } })
			: await tx.employeeGroup.findMany({ where, orderBy, select: { id: true, sortOrder: true } });
		if (rows.length !== expectedIds.length || rows.some((row, index) => row.id !== expectedIds[index])) throw new WorkforceOrderConflictError();
		for (const [index, id] of orderedIds.entries()) {
			const sortOrder = index + 1;
			if (rows.find((row) => row.id === id)?.sortOrder === sortOrder) continue;
			const before = await readMasterSnapshot(tx, resource, id);
			const data = { sortOrder };
			const result = resource === 'employment-types' ? await tx.employmentType.updateMany({ where: { id, deletedAt: null }, data })
				: resource === 'positions' ? await tx.position.updateMany({ where: { id, deletedAt: null }, data })
				: resource === 'departments' ? await tx.department.updateMany({ where: { id, deletedAt: null }, data })
				: await tx.employeeGroup.updateMany({ where: { id, deletedAt: null }, data });
			if (result.count !== 1) throw new WorkforceOrderConflictError();
			await writeAuditLog(tx, actorId, 'update', resource, id);
			await recordMasterChange(tx, resource, id, actorId, 'update', before, await readMasterSnapshot(tx, resource, id));
		}
		return orderedIds;
	}, { isolationLevel: 'Serializable' });
}
