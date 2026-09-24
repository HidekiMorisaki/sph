import { writeAuditLog } from '$lib/server/api/admin';
import { getPrisma } from '$lib/server/prisma';
import type { Prisma } from '$lib/server/generated/prisma/client';
import type { ListQuery } from '$lib/server/api/query';

export const employeeMasterResources = ['departments', 'employee-groups', 'positions', 'employment-types', 'branches'] as const;
export type EmployeeMasterResource = (typeof employeeMasterResources)[number];
export const masterSortFields = ['id', 'code', 'name', 'createdAt', 'updatedAt'] as const;
export const branchSortFields = [...masterSortFields, 'notes'] as const;
export type MasterSortField = (typeof branchSortFields)[number];
export type EmployeeMasterInput = { code: string; name: string; notes?: string | null };

export function isEmployeeMasterResource(resource: string): resource is EmployeeMasterResource {
	return employeeMasterResources.includes(resource as EmployeeMasterResource);
}

export function masterInput(resource: EmployeeMasterResource, value: unknown): EmployeeMasterInput | null {
	if (!value || typeof value !== 'object') return null;
	const body = value as Record<string, unknown>;
	if (typeof body.code !== 'string' || typeof body.name !== 'string') return null;
	const code = body.code.trim();
	const name = body.name.trim();
	if (!code || !name || code.length > 64 || name.length > 128) return null;
	if (resource !== 'branches') return { code, name };
	if (body.notes !== undefined && body.notes !== null && typeof body.notes !== 'string') return null;
	const notes = typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim() : null;
	return notes && notes.length > 5000 ? null : { code, name, notes };
}

export async function listMasters(resource: EmployeeMasterResource, query: ListQuery<MasterSortField>, search = '') {
	const db = getPrisma();
	const orderBy = [
		{ [query.sortBy]: query.sortOrder },
		...(query.sortBy === 'id' ? [] : [{ id: 'asc' as const }])
	];
	const page = { where: { deletedAt: null, ...(search ? { OR: [{ code: { contains: search, mode: 'insensitive' as const } }, { name: { contains: search, mode: 'insensitive' as const } }] } : {}) }, skip: query.offset, take: query.limit } as const;
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
			const where: Prisma.BranchWhereInput = { deletedAt: null, ...(search ? { OR: [{ code: { contains: search, mode: 'insensitive' } }, { name: { contains: search, mode: 'insensitive' } }, { notes: { contains: search, mode: 'insensitive' } }] } : {}) };
			const [total, items] = await db.$transaction([
				db.branch.count({ where }),
				db.branch.findMany({ where, skip: query.offset, take: query.limit, orderBy: orderBy as Prisma.BranchOrderByWithRelationInput[] })
			]);
			return { total, items };
		}
	}
}

export async function createMaster(resource: EmployeeMasterResource, data: EmployeeMasterInput, actorId: number) {
	return getPrisma().$transaction(async (tx) => {
		let item: { id: number; code: string; name: string; notes?: string | null };
		switch (resource) {
			case 'departments': item = await tx.department.create({ data: { code: data.code, name: data.name } }); break;
			case 'employee-groups': item = await tx.employeeGroup.create({ data: { code: data.code, name: data.name } }); break;
			case 'positions': item = await tx.position.create({ data: { code: data.code, name: data.name } }); break;
			case 'employment-types': item = await tx.employmentType.create({ data: { code: data.code, name: data.name } }); break;
			case 'branches': item = await tx.branch.create({ data: { code: data.code, name: data.name, notes: data.notes ?? null } }); break;
		}
		await writeAuditLog(tx, actorId, 'create', resource, item.id);
		return item;
	});
}

export async function updateMaster(resource: EmployeeMasterResource, id: number, data: EmployeeMasterInput, actorId: number) {
	return getPrisma().$transaction(async (tx) => {
		let result: { count: number };
		switch (resource) {
			case 'departments': result = await tx.department.updateMany({ where: { id, deletedAt: null }, data: { code: data.code, name: data.name } }); break;
			case 'employee-groups': result = await tx.employeeGroup.updateMany({ where: { id, deletedAt: null }, data: { code: data.code, name: data.name } }); break;
			case 'positions': result = await tx.position.updateMany({ where: { id, deletedAt: null }, data: { code: data.code, name: data.name } }); break;
			case 'employment-types': result = await tx.employmentType.updateMany({ where: { id, deletedAt: null }, data: { code: data.code, name: data.name } }); break;
			case 'branches': result = await tx.branch.updateMany({ where: { id, deletedAt: null }, data: { code: data.code, name: data.name, notes: data.notes ?? null } }); break;
		}
		if (result.count !== 1) return null;
		await writeAuditLog(tx, actorId, 'update', resource, id);
		return { id, code: data.code, name: data.name, ...(resource === 'branches' ? { notes: data.notes ?? null } : {}) };
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
