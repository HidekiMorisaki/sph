import type { Prisma } from '$lib/server/generated/prisma/client';
import { writeAuditLog } from './admin';

type FieldValue = { value: string | null; display: string | null };
export type EmployeeFields = Record<string, FieldValue>;

const field = (value: string | number | null | undefined, display?: string | null): FieldValue => ({
	value: value === null || value === undefined ? null : String(value),
	display: display === undefined ? value === null || value === undefined ? null : String(value) : display
});
const date = (value: Date | null) => value?.toISOString().slice(0, 10) ?? null;

export async function readEmployeeFields(tx: Prisma.TransactionClient, employeeId: number): Promise<EmployeeFields> {
	const employee = await tx.employee.findUniqueOrThrow({
		where: { id: employeeId },
		select: {
			employeeCode: true,
			firstName: true,
			middleName: true,
			lastName: true,
			nameKana: true,
			birthDate: true,
			gender: true,
			bloodType: true,
			postalCode: true,
			prefecture: true,
			city: true,
			streetAddress: true,
			buildingName: true,
			mobilePhone: true,
			email: true,
			hiredAt: true,
			groupId: true,
			employmentTypeId: true,
			branchId: true,
			retiredAt: true,
			notes: true,
			group: { select: { name: true } },
			departmentAssignments: {
				where: { deletedAt: null, department: { deletedAt: null } },
				select: { isPrimary: true, departmentId: true, department: { select: { name: true, sortOrder: true } } },
				orderBy: [{ isPrimary: 'desc' }, { department: { sortOrder: 'asc' } }, { department: { name: 'asc' } }, { id: 'asc' }]
			},
			positionAssignments: {
				where: { deletedAt: null, position: { deletedAt: null } },
				select: { isPrimary: true, positionId: true, position: { select: { name: true, sortOrder: true } } },
				orderBy: [{ isPrimary: 'desc' }, { position: { sortOrder: 'asc' } }, { position: { name: 'asc' } }, { id: 'asc' }]
			},
			employmentType: { select: { name: true } },
			branch: { select: { name: true } },
			roleGrants: {
				where: { deletedAt: null, scopeType: 'global', role: { deletedAt: null } },
				select: { role: { select: { code: true, name: true } } }
			}
		}
	});
	const roles = employee.roleGrants.map((grant) => grant.role).sort((left, right) => left.name.localeCompare(right.name, 'en'));
	return {
		employeeCode: field(employee.employeeCode),
		firstName: field(employee.firstName),
		middleName: field(employee.middleName),
		lastName: field(employee.lastName),
		nameKana: field(employee.nameKana),
		birthDate: field(date(employee.birthDate)),
		gender: field(employee.gender),
		bloodType: field(employee.bloodType),
		postalCode: field(employee.postalCode),
		prefecture: field(employee.prefecture),
		city: field(employee.city),
		streetAddress: field(employee.streetAddress),
		buildingName: field(employee.buildingName),
		mobilePhone: field(employee.mobilePhone),
		email: field(employee.email),
		hiredAt: field(date(employee.hiredAt)),
		departments: field(employee.departmentAssignments.map((assignment) => assignment.departmentId).join('|'), employee.departmentAssignments.map((assignment) => assignment.department.name).join(', ')),
		primaryDepartmentId: field(employee.departmentAssignments.find((assignment) => assignment.isPrimary)?.departmentId ?? null, employee.departmentAssignments.find((assignment) => assignment.isPrimary)?.department.name ?? null),
		groupId: field(employee.groupId, employee.group?.name ?? null),
		positions: field(employee.positionAssignments.map((assignment) => assignment.positionId).join('|'), employee.positionAssignments.map((assignment) => assignment.position.name).join(', ')),
		primaryPositionId: field(employee.positionAssignments.find((assignment) => assignment.isPrimary)?.positionId ?? null, employee.positionAssignments.find((assignment) => assignment.isPrimary)?.position.name ?? null),
		employmentTypeId: field(employee.employmentTypeId, employee.employmentType.name),
		branchId: field(employee.branchId, employee.branch.name),
		retiredAt: field(date(employee.retiredAt)),
		notes: field(employee.notes),
		roles: field(roles.map((role) => role.code).join('|'), roles.map((role) => role.name).join(', '))
	};
}

export async function recordEmployeeChange(
	tx: Prisma.TransactionClient,
	employeeId: number,
	actorId: number,
	action: 'create' | 'update' | 'delete',
	before: EmployeeFields | null,
	after: EmployeeFields | null
) {
	const keys = Object.keys(after ?? before ?? {});
	const changes = keys.flatMap((key) => {
		const oldValue = before?.[key] ?? field(null);
		const newValue = after?.[key] ?? field(null);
		return oldValue.value === newValue.value ? [] : [{ field: key, before: oldValue.display, after: newValue.display }];
	});
	if (action === 'update' && changes.length === 0) return;
	const item = await tx.employeeChangeHistory.create({ data: { employeeId, actorId, action, changes } });
	await writeAuditLog(tx, actorId, 'record_change', 'employee_change_history', item.id);
}
