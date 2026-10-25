import type { Prisma } from '$lib/server/generated/prisma/client';
import { throwApiError } from './response';

/** Employee first, then asset/title: shared order for departure and new allocations. */
export async function lockEmployeeAllocation(tx: Prisma.TransactionClient, employeeId: number) {
 await tx.$queryRaw`SELECT id FROM employees WHERE id = ${employeeId} FOR UPDATE`;
 const employee = await tx.employee.findUnique({where:{id:employeeId},select:{deletedAt:true,assetReturnCompletedAt:true,deletionScheduledOn:true}});
 if (!employee || employee.deletedAt || employee.assetReturnCompletedAt || employee.deletionScheduledOn)
  throwApiError(409,'EMPLOYEE_DEPARTURE_PENDING','This employee cannot receive a new asset assignment.');
}
