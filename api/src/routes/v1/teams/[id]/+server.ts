import { hasScopedPermissionOperation } from '$lib/server/auth/permissions';
import { requireOperationApi, writeAuditLog } from '$lib/server/api/admin';
import { parseId } from '$lib/server/api/database';
import { parseTeam, teamReader, teamSelect, teamConflictResponse } from '$lib/server/api/teams';
import { readEmployeeFields, recordEmployeeChange } from '$lib/server/api/employee-history';
import { success, failure, throwApiError } from '$lib/server/api/response';
import { getPrisma } from '$lib/server/prisma';
import { Prisma } from '$lib/server/generated/prisma/client';

export async function GET({ locals, params }: import('./$types').RequestEvent) {
 const actor = teamReader(locals.user);
 const id = parseId(params.id);
 const item = id ? await getPrisma().team.findFirst({ where: { id, deletedAt: null }, select: teamSelect }) : null;
 if (!item) return failure(404, 'NOT_FOUND', 'Not found.');
 const members = await getPrisma().employeeTeam.findMany({ where: { teamId: item.id, deletedAt: null, employee: { deletedAt: null } }, select: { employee: { select: { branchId: true } } } });
 const canDelete = actor.permissionOperations.includes('teams.delete') && members.every(({ employee }) => hasScopedPermissionOperation(actor, 'teams.members.remove', employee.branchId) && hasScopedPermissionOperation(actor, 'employees.read', employee.branchId));
 return success({ ...item, allowedOperations: { delete: canDelete } });
}

export async function PATCH({ locals, params, request }: import('./$types').RequestEvent) {
 const actor = requireOperationApi(locals.user, 'teams.update');
 teamReader(actor);
 const id = parseId(params.id);
 if (!id) return failure(404, 'NOT_FOUND', 'Not found.');
 const input = parseTeam(await request.json().catch(() => null));
 try {
  return await getPrisma().$transaction(async tx => {
   const before = await tx.team.findFirst({ where: { id, deletedAt: null }, select: teamSelect });
   if (!before) return failure(404, 'NOT_FOUND', 'Not found.');
   const item = await tx.team.update({ where: { id }, data: input, select: teamSelect });
   await writeAuditLog(tx, actor.id, 'update', 'team', id, { before: { name: before.name, description: before.description }, after: input });
   return success(item);
  }, { isolationLevel: 'Serializable' });
 } catch (error) {
  const conflict = await teamConflictResponse(error, input.name, id);
  if (conflict) return conflict;
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') return failure(409, 'CONCURRENT_CHANGE', 'Reload and try again.');
  throw error;
 }
}

export async function DELETE({ locals, params }: import('./$types').RequestEvent) {
 const actor = requireOperationApi(locals.user, 'teams.delete');
 teamReader(actor);
 const id = parseId(params.id);
 if (!id) return failure(404, 'NOT_FOUND', 'Not found.');
 try {
  await getPrisma().$transaction(async tx => {
   const before = await tx.team.findFirst({ where: { id, deletedAt: null }, select: teamSelect });
   if (!before) throwApiError(404, 'NOT_FOUND', 'Not found.');
   const members = await tx.employeeTeam.findMany({ where: { teamId: id, deletedAt: null, employee: { deletedAt: null } }, select: { employeeId: true, employee: { select: { branchId: true } } } });
   if (members.some(({ employee }) => !hasScopedPermissionOperation(actor, 'teams.members.remove', employee.branchId) || !hasScopedPermissionOperation(actor, 'employees.read', employee.branchId))) throwApiError(403, 'BRANCH_ACCESS_DENIED', 'Permission to remove every team member is required.');
   for (const { employeeId } of members) {
    const employeeBefore = await readEmployeeFields(tx, employeeId);
    await tx.employeeTeam.updateMany({ where: { teamId: id, employeeId, deletedAt: null }, data: { deletedAt: new Date() } });
    await recordEmployeeChange(tx, employeeId, actor.id, 'update', employeeBefore, await readEmployeeFields(tx, employeeId));
   }
   const deletedAt = new Date();
   await tx.employeeTeam.updateMany({ where: { teamId: id, deletedAt: null }, data: { deletedAt } });
   await tx.team.update({ where: { id }, data: { deletedAt } });
   await writeAuditLog(tx, actor.id, 'delete', 'team', id, { name: before.name });
  }, { isolationLevel: 'Serializable' });
  return success({ id, deleted: true });
 } catch (error) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') return failure(409, 'CONCURRENT_CHANGE', 'Reload and try again.');
  throw error;
 }
}
