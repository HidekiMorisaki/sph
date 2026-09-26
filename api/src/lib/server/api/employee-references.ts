import type { Prisma } from '$lib/server/generated/prisma/client';
import type { ApiErrorDetail } from '$lib/server/api/response';

type ReferenceInput = {
	departmentId: number | null;
	groupId: number | null;
	positionId: number | null;
	employmentTypeId: number | null;
	branchId: number | null;
};

export async function employeeReferenceErrors(tx: Prisma.TransactionClient, data: ReferenceInput): Promise<ApiErrorDetail[]> {
	const checks = await Promise.all([
		data.departmentId === null || tx.department.count({ where: { id: data.departmentId, deletedAt: null } }).then((count) => count === 1),
		data.groupId === null || (data.departmentId !== null && tx.employeeGroup.count({ where: { id: data.groupId, departmentId: data.departmentId, deletedAt: null } }).then((count) => count === 1)),
		data.positionId === null || tx.position.count({ where: { id: data.positionId, deletedAt: null } }).then((count) => count === 1),
		data.employmentTypeId === null || tx.employmentType.count({ where: { id: data.employmentTypeId, deletedAt: null } }).then((count) => count === 1),
		data.branchId === null || tx.branch.count({ where: { id: data.branchId, deletedAt: null } }).then((count) => count === 1)
	]);
	const fields = ['departmentId', 'groupId', 'positionId', 'employmentTypeId', 'branchId'];
	return checks.flatMap((active, index) => active ? [] : [{ field: fields[index], reason: index === 1 ? 'Select a group in the chosen department.' : 'Select an active option.' }]);
}
