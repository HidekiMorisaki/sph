import type { Prisma } from '$lib/server/generated/prisma/client';
import type { ApiErrorDetail } from '$lib/server/api/response';

type ReferenceInput = {
	departmentIds: number[];
	primaryDepartmentId: number | null;
	groupId: number | null;
	positionIds: number[];
	employmentTypeId: number | null;
	branchId: number | null;
};

export async function employeeReferenceErrors(tx: Prisma.TransactionClient, data: ReferenceInput): Promise<ApiErrorDetail[]> {
	const checks = await Promise.all([
		data.departmentIds.length === 0 || tx.department.count({ where: { id: { in: data.departmentIds }, deletedAt: null } }).then((count) => count === data.departmentIds.length),
		data.groupId === null || (data.primaryDepartmentId !== null && tx.employeeGroup.count({ where: { id: data.groupId, departmentId: data.primaryDepartmentId, deletedAt: null } }).then((count) => count === 1)),
		data.positionIds.length === 0 || tx.position.count({ where: { id: { in: data.positionIds }, deletedAt: null } }).then((count) => count === data.positionIds.length),
		data.employmentTypeId === null || tx.employmentType.count({ where: { id: data.employmentTypeId, deletedAt: null } }).then((count) => count === 1),
		data.branchId === null || tx.branch.count({ where: { id: data.branchId, deletedAt: null } }).then((count) => count === 1)
	]);
	const fields = ['departmentIds', 'groupId', 'positionIds', 'employmentTypeId', 'branchId'];
	return checks.flatMap((active, index) => active ? [] : [{ field: fields[index], reason: index === 1 ? 'Select a group in the chosen department.' : 'Select an active option.' }]);
}
