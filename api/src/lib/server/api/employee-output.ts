import type { Prisma } from '$lib/server/generated/prisma/client';
import { employeeDerivedValues, employeeReferenceDate } from '$lib/server/api/employee-derived';
import { socialLinkPlatforms } from '$lib/server/api/social-links';

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
	groupId: true,
	employmentTypeId: true,
	branchId: true,
	retiredAt: true,
	notes: true,
	createdAt: true,
	updatedAt: true,
	deletedAt: true,
	group: { select: { id: true, name: true } },
	departmentAssignments: {
		where: { deletedAt: null, department: { deletedAt: null } },
		select: { isPrimary: true, department: { select: { id: true, name: true, sortOrder: true } } },
		orderBy: [{ isPrimary: 'desc' }, { department: { sortOrder: 'asc' } }, { department: { name: 'asc' } }, { id: 'asc' }]
	},
	positionAssignments: {
		where: { deletedAt: null, position: { deletedAt: null } },
		select: { isPrimary: true, position: { select: { id: true, name: true, sortOrder: true } } },
		orderBy: [{ isPrimary: 'desc' }, { position: { sortOrder: 'asc' } }, { position: { name: 'asc' } }, { id: 'asc' }]
	},
	employmentType: { select: { id: true, name: true } },
	branch: { select: { id: true, name: true } },
	socialLinks: {
		where: { deletedAt: null, platform: { in: [...socialLinkPlatforms] } },
		select: { platform: true, url: true },
		orderBy: { id: 'asc' }
	},
	roleGrants: {
		where: { deletedAt: null, scopeType: 'global', role: { deletedAt: null } },
		select: { role: { select: { id: true, name: true } } }
	}
} satisfies Prisma.EmployeeSelect;

type EmployeeSafeRecord = Prisma.EmployeeGetPayload<{ select: typeof employeeSafeSelect }>;

export function employeeOutput(record: EmployeeSafeRecord, referenceDate = employeeReferenceDate()) {
	const { roleGrants, accountStatus, departmentAssignments, positionAssignments, ...employee } = record;
	const departments = departmentAssignments.map((assignment) => ({ ...assignment.department, isPrimary: assignment.isPrimary }));
	const positions = positionAssignments.map((assignment) => ({ ...assignment.position, isPrimary: assignment.isPrimary }));
	const primaryDepartment = departments.find((department) => department.isPrimary) ?? null;
	const primaryPosition = positions.find((position) => position.isPrimary) ?? null;
	const employmentStatus = employee.deletedAt
		? 'deleted'
		: employee.retiredAt && employee.retiredAt <= referenceDate
			? 'retired'
			: 'current';
	return {
		...employee,
		departmentId: primaryDepartment?.id ?? null,
		departmentRef: primaryDepartment && { id: primaryDepartment.id, name: primaryDepartment.name },
		departmentIds: departments.map((department) => department.id),
		primaryDepartmentId: primaryDepartment?.id ?? null,
		departments,
		departmentNames: departments.map((department) => department.name).join(' | '),
		positionId: primaryPosition?.id ?? null,
		position: primaryPosition && { id: primaryPosition.id, name: primaryPosition.name },
		positionIds: positions.map((position) => position.id),
		primaryPositionId: primaryPosition?.id ?? null,
		positions,
		positionNames: positions.map((position) => position.name).join(' | '),
		employmentStatus,
		canIssueInvitation: accountStatus === 'unprovisioned' && employmentStatus === 'current',
		...employeeDerivedValues(employee, referenceDate),
		roles: roleGrants.map((grant) => grant.role).sort((left, right) => left.name.localeCompare(right.name, 'en'))
	};
}
