import type { Prisma } from '$lib/server/generated/prisma/client';

export async function syncEmployeeDepartments(
	tx: Prisma.TransactionClient,
	employeeId: number,
	departmentIds: number[],
	primaryDepartmentId: number | null
) {
	const now = new Date();
	await tx.employeeDepartment.updateMany({
		where: { employeeId, deletedAt: null },
		data: { isPrimary: false }
	});
	await tx.employeeDepartment.updateMany({
		where: { employeeId, deletedAt: null, departmentId: { notIn: departmentIds } },
		data: { deletedAt: now }
	});
	for (const departmentId of departmentIds) {
		const existing = await tx.employeeDepartment.findUnique({
			where: { employeeId_departmentId: { employeeId, departmentId } },
			select: { id: true }
		});
		const data = { deletedAt: null, isPrimary: departmentId === primaryDepartmentId };
		if (existing) await tx.employeeDepartment.update({ where: { id: existing.id }, data });
		else await tx.employeeDepartment.create({ data: { employeeId, departmentId, ...data } });
	}
}
