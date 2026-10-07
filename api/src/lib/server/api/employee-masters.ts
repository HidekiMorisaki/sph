import { writeAuditLog } from '$lib/server/api/admin';
import { readMasterSnapshot, recordMasterChange } from '$lib/server/api/master-history';
import { getPrisma } from '$lib/server/prisma';
import type { Prisma } from '$lib/server/generated/prisma/client';
import type { ListQuery } from '$lib/server/api/query';

export const employeeMasterResources = ['departments', 'employee-groups', 'positions', 'employment-types', 'branches'] as const;
export type EmployeeMasterResource = (typeof employeeMasterResources)[number];
export const namedMasterSortFields = ['id', 'name', 'sortOrder', 'createdAt', 'updatedAt'] as const;
export const employeeGroupSortFields = ['id', 'department', 'name', 'sortOrder', 'createdAt', 'updatedAt'] as const;
export const branchSortFields = ['id', 'name', 'sortOrder', 'openedOn', 'closedOn', 'postalCode', 'prefecture', 'city', 'streetAddress', 'buildingName', 'phoneNumber1', 'faxNumber1', 'notes', 'createdAt', 'updatedAt'] as const;
export type MasterSortField = (typeof namedMasterSortFields)[number] | (typeof employeeGroupSortFields)[number] | (typeof branchSortFields)[number];
type BranchContactInput = {
	openedOn: Date | null;
	closedOn: Date | null;
	postalCode: string | null;
	prefecture: string | null;
	city: string | null;
	streetAddress: string | null;
	buildingName: string | null;
	phoneNumber1: string | null;
	phoneNumber1Label: string | null;
	phoneNumber2: string | null;
	phoneNumber2Label: string | null;
	faxNumber1: string | null;
	faxNumber1Label: string | null;
	faxNumber2: string | null;
	faxNumber2Label: string | null;
	managerEmployeeId: number | null;
	deputyManagerEmployeeId: number | null;
};
export type EmployeeMasterInput = { name: string; departmentId?: number; sortOrder?: number; notes?: string | null } & Partial<BranchContactInput>;

function optionalText(body: Record<string, unknown>, key: string, maximum: number): string | null | undefined {
	const raw = body[key];
	if (raw === undefined || raw === null || raw === '') return null;
	if (typeof raw !== 'string') return undefined;
	const value = raw.trim();
	return value.length <= maximum ? value || null : undefined;
}

function optionalId(body: Record<string, unknown>, key: string): number | null | undefined {
	const raw = body[key];
	if (raw === undefined || raw === null || raw === '') return null;
	const value = typeof raw === 'number' ? raw : typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) : NaN;
	return Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

function optionalDate(body: Record<string, unknown>, key: string): Date | null | undefined {
	const raw = body[key];
	if (raw === undefined || raw === null || raw === '') return null;
	if (typeof raw !== 'string') return undefined;
	const value = raw.trim();
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
	const parsed = new Date(`${value}T00:00:00.000Z`);
	return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value ? parsed : undefined;
}

const branchEmployeeSelect = { id: true, employeeCode: true, firstName: true, middleName: true, lastName: true } as const;
const branchRelations = {
	manager: { select: branchEmployeeSelect },
	deputyManager: { select: branchEmployeeSelect }
} as const;
const employeeGroupRelations = { department: { select: { id: true, name: true } } } as const;

function withUsageCount<T extends object>(item: T): Omit<T, '_count'> & { usageCount: number } {
	const { _count, ...value } = item as T & { _count: Record<string, number> };
	return { ...value, usageCount: Object.values(_count).reduce((total, count) => total + count, 0) };
}

export class BranchEmployeeReferenceError extends Error {
	constructor(readonly field: 'managerEmployeeId' | 'deputyManagerEmployeeId') { super('Invalid branch employee reference.'); }
}

export class BranchInUseError extends Error {
	constructor() { super('The branch is still referenced.'); }
}

export class EmployeeGroupDepartmentReferenceError extends Error {
	constructor() { super('Invalid employee group department reference.'); }
}

export class EmployeeGroupDepartmentConflictError extends Error {
	constructor() { super('The employee group is referenced by employees in another department.'); }
}

async function branchReferenceCount(tx: Prisma.TransactionClient, id: number) {
	const [employees, rooms] = await Promise.all([
		tx.employee.count({ where: { branchId: id, deletedAt: null } }),
		tx.room.count({ where: { branchId: id, deletedAt: null } })
	]);
	return employees + rooms;
}

async function validateBranchEmployees(tx: Prisma.TransactionClient, data: EmployeeMasterInput) {
	const managerEmployeeId = data.managerEmployeeId ?? null;
	const deputyManagerEmployeeId = data.deputyManagerEmployeeId ?? null;
	if (deputyManagerEmployeeId && !managerEmployeeId) throw new BranchEmployeeReferenceError('managerEmployeeId');
	if (managerEmployeeId && deputyManagerEmployeeId === managerEmployeeId) throw new BranchEmployeeReferenceError('deputyManagerEmployeeId');
	const ids = [managerEmployeeId, deputyManagerEmployeeId].filter((id): id is number => id !== null);
	if (!ids.length) return;
	const employees = await tx.employee.findMany({ where: { id: { in: ids }, deletedAt: null }, select: { id: true } });
	if (employees.length !== ids.length) {
		const found = new Set(employees.map((employee) => employee.id));
		throw new BranchEmployeeReferenceError(managerEmployeeId && !found.has(managerEmployeeId) ? 'managerEmployeeId' : 'deputyManagerEmployeeId');
	}
}

function branchData(data: EmployeeMasterInput) {
	return {
		name: data.name,
		...(data.sortOrder === undefined ? {} : { sortOrder: data.sortOrder }),
		openedOn: data.openedOn ?? null,
		closedOn: data.closedOn ?? null,
		postalCode: data.postalCode ?? null,
		prefecture: data.prefecture ?? null,
		city: data.city ?? null,
		streetAddress: data.streetAddress ?? null,
		buildingName: data.buildingName ?? null,
		phoneNumber1: data.phoneNumber1 ?? null,
		phoneNumber1Label: data.phoneNumber1Label ?? null,
		phoneNumber2: data.phoneNumber2 ?? null,
		phoneNumber2Label: data.phoneNumber2Label ?? null,
		faxNumber1: data.faxNumber1 ?? null,
		faxNumber1Label: data.faxNumber1Label ?? null,
		faxNumber2: data.faxNumber2 ?? null,
		faxNumber2Label: data.faxNumber2Label ?? null,
		managerEmployeeId: data.managerEmployeeId ?? null,
		deputyManagerEmployeeId: data.deputyManagerEmployeeId ?? null,
		notes: data.notes ?? null
	};
}

export function isEmployeeMasterResource(resource: string): resource is EmployeeMasterResource {
	return employeeMasterResources.includes(resource as EmployeeMasterResource);
}

export function masterInput(resource: EmployeeMasterResource, value: unknown): EmployeeMasterInput | null {
	if (!value || typeof value !== 'object') return null;
	const body = value as Record<string, unknown>;
	if (typeof body.name !== 'string') return null;
	const name = body.name.trim();
	if (!name || name.length > 128) return null;
	const notes = optionalText(body, 'notes', 5000);
	if (notes === undefined) return null;
	let sortOrder: number | undefined;
	if (body.sortOrder !== undefined) {
		const raw = body.sortOrder;
		sortOrder = typeof raw === 'number' ? raw : typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) : NaN;
		if (!Number.isSafeInteger(sortOrder) || sortOrder < 0) return null;
	}
	if (resource === 'employee-groups') {
		const departmentId = optionalId(body, 'departmentId');
		return typeof departmentId === 'number' ? { name, departmentId, notes, ...(sortOrder === undefined ? {} : { sortOrder }) } : null;
	}
	if (resource !== 'branches') return { name, notes, ...(sortOrder === undefined ? {} : { sortOrder }) };
	const values = {
		openedOn: optionalDate(body, 'openedOn'),
		closedOn: optionalDate(body, 'closedOn'),
		postalCode: optionalText(body, 'postalCode', 8),
		prefecture: optionalText(body, 'prefecture', 64),
		city: optionalText(body, 'city', 128),
		streetAddress: optionalText(body, 'streetAddress', 255),
		buildingName: optionalText(body, 'buildingName', 255),
		phoneNumber1: optionalText(body, 'phoneNumber1', 32),
		phoneNumber1Label: optionalText(body, 'phoneNumber1Label', 128),
		phoneNumber2: optionalText(body, 'phoneNumber2', 32),
		phoneNumber2Label: optionalText(body, 'phoneNumber2Label', 128),
		faxNumber1: optionalText(body, 'faxNumber1', 32),
		faxNumber1Label: optionalText(body, 'faxNumber1Label', 128),
		faxNumber2: optionalText(body, 'faxNumber2', 32),
		faxNumber2Label: optionalText(body, 'faxNumber2Label', 128),
		managerEmployeeId: optionalId(body, 'managerEmployeeId'),
		deputyManagerEmployeeId: optionalId(body, 'deputyManagerEmployeeId'),
		notes: optionalText(body, 'notes', 5000)
	};
	if (Object.values(values).some((value) => value === undefined)) return null;
	if (values.openedOn && values.closedOn && values.closedOn < values.openedOn) return null;
	if (values.postalCode && !/^\d{3}-?\d{4}$/.test(values.postalCode)) return null;
	const phonePattern = /^[+0-9][0-9 ()-]{6,31}$/;
	for (const number of [values.phoneNumber1, values.phoneNumber2, values.faxNumber1, values.faxNumber2]) if (number && !phonePattern.test(number)) return null;
	if ((values.phoneNumber1Label && !values.phoneNumber1) || (values.phoneNumber2 && !values.phoneNumber1) || (values.phoneNumber2Label && !values.phoneNumber2)) return null;
	if ((values.faxNumber1Label && !values.faxNumber1) || (values.faxNumber2 && !values.faxNumber1) || (values.faxNumber2Label && !values.faxNumber2)) return null;
	if ((values.phoneNumber1 && values.phoneNumber1 === values.phoneNumber2) || (values.faxNumber1 && values.faxNumber1 === values.faxNumber2)) return null;
	if ((values.deputyManagerEmployeeId && !values.managerEmployeeId) || (values.managerEmployeeId && values.managerEmployeeId === values.deputyManagerEmployeeId)) return null;
	return { name, ...(sortOrder === undefined ? {} : { sortOrder }), ...(values as BranchContactInput & { notes: string | null }) };
}

export async function listMasters(resource: EmployeeMasterResource, query: ListQuery<MasterSortField>, search = '') {
	const db = getPrisma();
	const orderBy = [
		{ [query.sortBy]: query.sortOrder },
		...(query.sortBy === 'id' ? [] : [{ id: 'asc' as const }])
	];
	const namedPage = { where: { deletedAt: null, ...(search ? { name: { contains: search, mode: 'insensitive' as const } } : {}) }, skip: query.offset, take: query.limit } as const;
	switch (resource) {
		case 'departments': {
			const [total, items] = await db.$transaction([
				db.department.count({ where: namedPage.where }),
				db.department.findMany({ ...namedPage, orderBy: orderBy as Prisma.DepartmentOrderByWithRelationInput[], include: { _count: { select: { employeeAssignments: { where: { deletedAt: null, employee: { deletedAt: null } } }, groups: { where: { deletedAt: null } } } } } })
			]);
			return { total, items: items.map(withUsageCount) };
		}
		case 'employee-groups': {
			const where: Prisma.EmployeeGroupWhereInput = {
				deletedAt: null,
				...(search ? { OR: [
					{ name: { contains: search, mode: 'insensitive' } },
					{ department: { is: { deletedAt: null, name: { contains: search, mode: 'insensitive' } } } }
				] } : {})
			};
			const groupOrderBy = query.sortBy === 'department'
				? [{ department: { name: query.sortOrder } }, { id: 'asc' as const }]
				: orderBy as Prisma.EmployeeGroupOrderByWithRelationInput[];
			const [total, items] = await db.$transaction([
				db.employeeGroup.count({ where }),
				db.employeeGroup.findMany({ where, skip: query.offset, take: query.limit, orderBy: groupOrderBy, include: { ...employeeGroupRelations, _count: { select: { employees: { where: { deletedAt: null } } } } } })
			]);
			return { total, items: items.map(withUsageCount) };
		}
		case 'positions': {
			const [total, items] = await db.$transaction([
				db.position.count({ where: namedPage.where }),
				db.position.findMany({ ...namedPage, orderBy: orderBy as Prisma.PositionOrderByWithRelationInput[], include: { _count: { select: { employeeAssignments: { where: { deletedAt: null, employee: { deletedAt: null } } } } } } })
			]);
			return { total, items: items.map(withUsageCount) };
		}
		case 'employment-types': {
			const [total, items] = await db.$transaction([
				db.employmentType.count({ where: namedPage.where }),
				db.employmentType.findMany({ ...namedPage, orderBy: orderBy as Prisma.EmploymentTypeOrderByWithRelationInput[], include: { _count: { select: { employees: { where: { deletedAt: null } } } } } })
			]);
			return { total, items: items.map(withUsageCount) };
		}
		case 'branches': {
			const where: Prisma.BranchWhereInput = { deletedAt: null, ...(search ? { OR: [
				{ name: { contains: search, mode: 'insensitive' } },
				{ postalCode: { contains: search, mode: 'insensitive' } },
				{ prefecture: { contains: search, mode: 'insensitive' } },
				{ city: { contains: search, mode: 'insensitive' } },
				{ streetAddress: { contains: search, mode: 'insensitive' } },
				{ buildingName: { contains: search, mode: 'insensitive' } },
				{ phoneNumber1: { contains: search, mode: 'insensitive' } },
				{ phoneNumber1Label: { contains: search, mode: 'insensitive' } },
				{ phoneNumber2: { contains: search, mode: 'insensitive' } },
				{ phoneNumber2Label: { contains: search, mode: 'insensitive' } },
				{ faxNumber1: { contains: search, mode: 'insensitive' } },
				{ faxNumber1Label: { contains: search, mode: 'insensitive' } },
				{ faxNumber2: { contains: search, mode: 'insensitive' } },
				{ faxNumber2Label: { contains: search, mode: 'insensitive' } },
				{ manager: { is: { deletedAt: null, OR: [{ employeeCode: { contains: search, mode: 'insensitive' } }, { firstName: { contains: search, mode: 'insensitive' } }, { middleName: { contains: search, mode: 'insensitive' } }, { lastName: { contains: search, mode: 'insensitive' } }] } } },
				{ deputyManager: { is: { deletedAt: null, OR: [{ employeeCode: { contains: search, mode: 'insensitive' } }, { firstName: { contains: search, mode: 'insensitive' } }, { middleName: { contains: search, mode: 'insensitive' } }, { lastName: { contains: search, mode: 'insensitive' } }] } } },
				{ notes: { contains: search, mode: 'insensitive' } }
			] } : {}) };
			const [total, items] = await db.$transaction([
				db.branch.count({ where }),
				db.branch.findMany({ where, skip: query.offset, take: query.limit, orderBy: orderBy as Prisma.BranchOrderByWithRelationInput[], include: { ...branchRelations, _count: { select: { employees: { where: { deletedAt: null } }, rooms: { where: { deletedAt: null } } } } } })
			]);
			return { total, items: items.map(withUsageCount) };
		}
	}
}

export async function createMaster(resource: EmployeeMasterResource, data: EmployeeMasterInput, actorId: number) {
	return getPrisma().$transaction(async (tx) => {
		let item: { id: number; name: string; notes?: string | null };
		const sortOrder = data.sortOrder ?? 2_147_483_647;
		switch (resource) {
			case 'departments': item = await tx.department.create({ data: { name: data.name, notes: data.notes, sortOrder } }); break;
			case 'employee-groups': {
				const departmentId = data.departmentId!;
				if (await tx.department.count({ where: { id: departmentId, deletedAt: null } }) !== 1) throw new EmployeeGroupDepartmentReferenceError();
				item = await tx.employeeGroup.create({ data: { name: data.name, departmentId, notes: data.notes, sortOrder }, include: employeeGroupRelations });
				break;
			}
			case 'positions': item = await tx.position.create({ data: { name: data.name, notes: data.notes, sortOrder } }); break;
			case 'employment-types': item = await tx.employmentType.create({ data: { name: data.name, notes: data.notes, sortOrder: 2_147_483_647 } }); break;
			case 'branches': {
				await validateBranchEmployees(tx, data);
				const branch = branchData(data);
				if (data.closedOn) {
					const created = await tx.branch.create({ data: branch });
					await tx.$executeRaw`UPDATE branches SET updated_at = CURRENT_TIMESTAMP, deleted_at = CURRENT_TIMESTAMP WHERE id = ${created.id}`;
					item = await tx.branch.findUniqueOrThrow({ where: { id: created.id }, include: branchRelations });
				} else item = await tx.branch.create({ data: branch, include: branchRelations });
				break;
			}
		}
		await writeAuditLog(tx, actorId, 'create', resource, item.id);
		await recordMasterChange(tx, resource, item.id, actorId, 'create', null, await readMasterSnapshot(tx, resource, item.id));
		if (resource === 'branches' && data.closedOn) {
			await writeAuditLog(tx, actorId, 'delete', resource, item.id);
			await recordMasterChange(tx, resource, item.id, actorId, 'delete', await readMasterSnapshot(tx, resource, item.id), null);
		}
		return item;
	}, { isolationLevel: 'Serializable' });
}

export async function updateMaster(resource: EmployeeMasterResource, id: number, data: EmployeeMasterInput, actorId: number) {
	return getPrisma().$transaction(async (tx) => {
		const before = await readMasterSnapshot(tx, resource, id);
		let result: { count: number };
		switch (resource) {
			case 'departments': result = await tx.department.updateMany({ where: { id, deletedAt: null }, data: { name: data.name, notes: data.notes, ...(data.sortOrder === undefined ? {} : { sortOrder: data.sortOrder }) } }); break;
			case 'employee-groups': {
				const departmentId = data.departmentId!;
				if (await tx.department.count({ where: { id: departmentId, deletedAt: null } }) !== 1) throw new EmployeeGroupDepartmentReferenceError();
				const conflictingEmployees = await tx.employee.count({
					where: { groupId: id, deletedAt: null, departmentAssignments: { none: { departmentId, isPrimary: true, deletedAt: null } } }
				});
				if (conflictingEmployees > 0) throw new EmployeeGroupDepartmentConflictError();
				result = await tx.employeeGroup.updateMany({ where: { id, deletedAt: null }, data: { name: data.name, departmentId, notes: data.notes, ...(data.sortOrder === undefined ? {} : { sortOrder: data.sortOrder }) } });
				break;
			}
			case 'positions': result = await tx.position.updateMany({ where: { id, deletedAt: null }, data: { name: data.name, notes: data.notes, ...(data.sortOrder === undefined ? {} : { sortOrder: data.sortOrder }) } }); break;
			case 'employment-types': result = await tx.employmentType.updateMany({ where: { id, deletedAt: null }, data: { name: data.name, notes: data.notes, ...(data.sortOrder === undefined ? {} : { sortOrder: data.sortOrder }) } }); break;
			case 'branches': {
				await validateBranchEmployees(tx, data);
				if (data.closedOn && await branchReferenceCount(tx, id) > 0) throw new BranchInUseError();
				const branch = branchData(data);
				if (data.closedOn) {
					result = await tx.branch.updateMany({ where: { id, deletedAt: null }, data: branch });
					if (result.count === 1) await tx.$executeRaw`UPDATE branches SET updated_at = CURRENT_TIMESTAMP, deleted_at = CURRENT_TIMESTAMP WHERE id = ${id} AND deleted_at IS NULL`;
				} else result = await tx.branch.updateMany({ where: { id, deletedAt: null }, data: branch });
				break;
			}
		}
		if (result.count !== 1) return null;
		await writeAuditLog(tx, actorId, resource === 'branches' && data.closedOn ? 'delete' : 'update', resource, id);
		await recordMasterChange(tx, resource, id, actorId, resource === 'branches' && data.closedOn ? 'delete' : 'update', before, resource === 'branches' && data.closedOn ? null : await readMasterSnapshot(tx, resource, id));
		if (resource === 'branches') return tx.branch.findUniqueOrThrow({ where: { id }, include: branchRelations });
		if (resource === 'employee-groups') return tx.employeeGroup.findUniqueOrThrow({ where: { id }, include: employeeGroupRelations });
		return { id, name: data.name, ...(data.sortOrder === undefined ? {} : { sortOrder: data.sortOrder }) };
	}, { isolationLevel: 'Serializable' });
}

export async function softDeleteMaster(resource: EmployeeMasterResource, id: number, actorId: number): Promise<'deleted' | 'not_found' | 'referenced'> {
	return getPrisma().$transaction(async (tx) => {
		const before = await readMasterSnapshot(tx, resource, id);
		let referenced = 0;
		switch (resource) {
			case 'departments': {
				const employees = await tx.employeeDepartment.count({ where: { departmentId: id, deletedAt: null, employee: { deletedAt: null } } });
				const groups = await tx.employeeGroup.count({ where: { departmentId: id, deletedAt: null } });
				referenced = employees + groups;
				break;
			}
			case 'employee-groups': referenced = await tx.employee.count({ where: { groupId: id, deletedAt: null } }); break;
			case 'positions': referenced = await tx.employeePosition.count({ where: { positionId: id, deletedAt: null, employee: { deletedAt: null } } }); break;
			case 'employment-types': referenced = await tx.employee.count({ where: { employmentTypeId: id, deletedAt: null } }); break;
			case 'branches': referenced = await branchReferenceCount(tx, id); break;
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
		await recordMasterChange(tx, resource, id, actorId, 'delete', before, null);
		return 'deleted';
	}, { isolationLevel: 'Serializable' });
}
