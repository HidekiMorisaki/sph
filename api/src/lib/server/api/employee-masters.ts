import { writeAuditLog } from '$lib/server/api/admin';
import { getPrisma } from '$lib/server/prisma';
import type { Prisma } from '$lib/server/generated/prisma/client';
import type { ListQuery } from '$lib/server/api/query';

export const employeeMasterResources = ['departments', 'employee-groups', 'positions', 'employment-types', 'branches'] as const;
export type EmployeeMasterResource = (typeof employeeMasterResources)[number];
export const masterSortFields = ['id', 'code', 'name', 'createdAt', 'updatedAt'] as const;
export type MasterSortField = (typeof masterSortFields)[number];

export function isEmployeeMasterResource(resource: string): resource is EmployeeMasterResource {
	return employeeMasterResources.includes(resource as EmployeeMasterResource);
}

export function masterInput(value: unknown): { code: string; name: string } | null {
	if (!value || typeof value !== 'object') return null;
	const body = value as Record<string, unknown>;
	if (typeof body.code !== 'string' || typeof body.name !== 'string') return null;
	const code = body.code.trim();
	const name = body.name.trim();
	return code && name && code.length <= 64 && name.length <= 128 ? { code, name } : null;
}

export async function listMasters(resource: EmployeeMasterResource, query: ListQuery<MasterSortField>) {
	const db = getPrisma();
	const orderBy = [
		{ [query.sortBy]: query.sortOrder },
		...(query.sortBy === 'id' ? [] : [{ id: 'asc' as const }])
	];
	const page = { where: { deletedAt: null }, skip: query.offset, take: query.limit } as const;
	switch (resource) {
		case 'departments': {
			const [total, items] = await db.$transaction([
				db.department.count({ where: page.where }),
				db.department.findMany({ ...page, orderBy: orderBy as Prisma.DepartmentOrderByWithRelationInput[] })
			]);
			return { total, items };
		}
		case 'employee-groups': {
			const [total, items] = await db.$transaction([
				db.employeeGroup.count({ where: page.where }),
				db.employeeGroup.findMany({ ...page, orderBy: orderBy as Prisma.EmployeeGroupOrderByWithRelationInput[] })
			]);
			return { total, items };
		}
		case 'positions': {
			const [total, items] = await db.$transaction([
				db.position.count({ where: page.where }),
				db.position.findMany({ ...page, orderBy: orderBy as Prisma.PositionOrderByWithRelationInput[] })
			]);
			return { total, items };
		}
		case 'employment-types': {
			const [total, items] = await db.$transaction([
				db.employmentType.count({ where: page.where }),
				db.employmentType.findMany({ ...page, orderBy: orderBy as Prisma.EmploymentTypeOrderByWithRelationInput[] })
			]);
			return { total, items };
		}
		case 'branches': {
			const [total, items] = await db.$transaction([
				db.branch.count({ where: page.where }),
				db.branch.findMany({ ...page, orderBy: orderBy as Prisma.BranchOrderByWithRelationInput[] })
			]);
			return { total, items };
		}
	}
}

export async function createMaster(resource: EmployeeMasterResource, data: { code: string; name: string }, actorId: number) {
	return getPrisma().$transaction(async (tx) => {
		let item: { id: number; code: string; name: string };
		switch (resource) {
			case 'departments': item = await tx.department.create({ data }); break;
			case 'employee-groups': item = await tx.employeeGroup.create({ data }); break;
			case 'positions': item = await tx.position.create({ data }); break;
			case 'employment-types': item = await tx.employmentType.create({ data }); break;
			case 'branches': item = await tx.branch.create({ data }); break;
		}
		await writeAuditLog(tx, actorId, 'create', resource, item.id);
		return item;
	});
}

export async function updateMaster(resource: EmployeeMasterResource, id: number, data: { code: string; name: string }, actorId: number) {
	return getPrisma().$transaction(async (tx) => {
		let result: { count: number };
		switch (resource) {
			case 'departments': result = await tx.department.updateMany({ where: { id, deletedAt: null }, data }); break;
			case 'employee-groups': result = await tx.employeeGroup.updateMany({ where: { id, deletedAt: null }, data }); break;
			case 'positions': result = await tx.position.updateMany({ where: { id, deletedAt: null }, data }); break;
			case 'employment-types': result = await tx.employmentType.updateMany({ where: { id, deletedAt: null }, data }); break;
			case 'branches': result = await tx.branch.updateMany({ where: { id, deletedAt: null }, data }); break;
		}
		if (result.count !== 1) return null;
		await writeAuditLog(tx, actorId, 'update', resource, id);
		return { id, ...data };
	});
}

export async function softDeleteMaster(resource: EmployeeMasterResource, id: number, actorId: number): Promise<'deleted' | 'not_found' | 'referenced'> {
	return getPrisma().$transaction(async (tx) => {
		let referenced = 0;
		switch (resource) {
			case 'departments': referenced = await tx.employee.count({ where: { departmentId: id, deletedAt: null } }); break;
			case 'employee-groups': referenced = await tx.employee.count({ where: { groupId: id, deletedAt: null } }); break;
			case 'positions': referenced = await tx.employee.count({ where: { positionId: id, deletedAt: null } }); break;
			case 'employment-types': referenced = await tx.employee.count({ where: { employmentTypeId: id, deletedAt: null } }); break;
			case 'branches': referenced = await tx.employee.count({ where: { branchId: id, deletedAt: null } }) + await tx.room.count({ where: { branchId: id, deletedAt: null } }); break;
		}
		if (referenced > 0) return 'referenced';
		const now = new Date();
		let result: { count: number };
		switch (resource) {
			case 'departments': result = await tx.department.updateMany({ where: { id, deletedAt: null }, data: { deletedAt: now } }); break;
			case 'employee-groups': result = await tx.employeeGroup.updateMany({ where: { id, deletedAt: null }, data: { deletedAt: now } }); break;
			case 'positions': result = await tx.position.updateMany({ where: { id, deletedAt: null }, data: { deletedAt: now } }); break;
			case 'employment-types': result = await tx.employmentType.updateMany({ where: { id, deletedAt: null }, data: { deletedAt: now } }); break;
			case 'branches': result = await tx.branch.updateMany({ where: { id, deletedAt: null }, data: { deletedAt: now } }); break;
		}
		if (result.count !== 1) return 'not_found';
		await writeAuditLog(tx, actorId, 'delete', resource, id);
		return 'deleted';
	}, { isolationLevel: 'Serializable' });
}
