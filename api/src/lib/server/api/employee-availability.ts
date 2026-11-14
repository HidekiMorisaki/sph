import type { Prisma } from '#lib/server/generated/prisma/client.js';
import { throwApiError } from './response';

/** Employee first, then asset/title: shared order for departure and new allocations. */
export async function lockEmployeeAllocation(tx: Prisma.TransactionClient, employeeId: number) {
 // Serialize departure/allocation without blocking foreign-key KEY SHARE locks
 // taken by audit/history inserts for the same employee. Employee IDs never change.
 await tx.$queryRaw`SELECT id FROM employees WHERE id = ${employeeId} FOR NO KEY UPDATE`;
 const employee = await tx.employee.findUnique({where:{id:employeeId},select:{deletedAt:true,assetReturnCompletedAt:true,deletionScheduledOn:true}});
 if (!employee || employee.deletedAt || employee.assetReturnCompletedAt || employee.deletionScheduledOn)
  throwApiError(409,'EMPLOYEE_DEPARTURE_PENDING','This employee cannot receive a new asset assignment.');
}
