import type { Prisma } from '$lib/server/generated/prisma/client';
import { employeeDerivedValues, employeeReferenceDate } from '$lib/server/api/employee-derived';

export const employeeSafeSelect = {
	id: true,
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
	accountStatus: true,
	hiredAt: true,
	departmentId: true,
	groupId: true,
	positionId: true,
	employmentTypeId: true,
	branchId: true,
	retiredAt: true,
	notes: true,
	createdAt: true,
	updatedAt: true,
	deletedAt: true,
	departmentRef: { select: { id: true, name: true } },
	group: { select: { id: true, name: true } },
	position: { select: { id: true, name: true } },
	employmentType: { select: { id: true, name: true } },
	branch: { select: { id: true, name: true } },
	roleGrants: {
		where: { deletedAt: null, scopeType: 'global', role: { deletedAt: null } },
		select: { role: { select: { code: true, name: true } } }
	}
} satisfies Prisma.EmployeeSelect;

type EmployeeSafeRecord = Prisma.EmployeeGetPayload<{ select: typeof employeeSafeSelect }>;

export function employeeOutput(record: EmployeeSafeRecord, referenceDate = employeeReferenceDate()) {
	const { roleGrants, accountStatus, ...employee } = record;
	return {
		...employee,
		canIssueInvitation: accountStatus === 'unprovisioned',
		...employeeDerivedValues(employee, referenceDate),
		roles: roleGrants.map((grant) => grant.role).sort((left, right) => left.name.localeCompare(right.name, 'en'))
	};
}
