import { requireScopedOperationApi } from '$lib/server/api/branch-access';
import { writeAuditLog } from '$lib/server/api/admin';
import { teamReader } from '$lib/server/api/teams';
import { parseId } from '$lib/server/api/database';
import { readEmployeeFields, recordEmployeeChange } from '$lib/server/api/employee-history';
import { success, failure, throwApiError } from '$lib/server/api/response';
import { getPrisma } from '$lib/server/prisma';
import { Prisma } from '$lib/server/generated/prisma/client';

async function change(locals: App.Locals, params: { id: string; employeeId: string }, add: boolean) {
 const { actor, branchId } = requireScopedOperationApi(locals.user, add ? 'teams.members.add' : 'teams.members.remove');
 teamReader(actor);
 const teamId = parseId(params.id), employeeId = parseId(params.employeeId);
 if (!teamId || !employeeId) return failure(404, 'NOT_FOUND', 'Not found.');
 try {
  await getPrisma().$transaction(async tx => {
   if (!await tx.team.count({ where: { id: teamId, deletedAt: null } })) throwApiError(404, 'NOT_FOUND', 'Not found.');
   const employee = await tx.employee.findFirst({ where: { id: employeeId, deletedAt: null }, select: { branchId: true } });
   if (!employee) throwApiError(404, 'NOT_FOUND', 'Not found.');
   if (branchId !== null && employee.branchId !== branchId) throwApiError(403, 'BRANCH_ACCESS_DENIED', 'Branch access is required.');
   const before = await readEmployeeFields(tx, employeeId);
   if (add) await tx.employeeTeam.upsert({ where: { employeeId_teamId: { employeeId, teamId } }, create: { employeeId, teamId }, update: { deletedAt: null } });
   else await tx.employeeTeam.updateMany({ where: { employeeId, teamId, deletedAt: null }, data: { deletedAt: new Date() } });
   await recordEmployeeChange(tx, employeeId, actor.id, 'update', before, await readEmployeeFields(tx, employeeId));
   await writeAuditLog(tx, actor.id, add ? 'add_member' : 'remove_member', 'team', teamId, { employeeId });
  }, { isolationLevel: 'Serializable' });
  return success({ teamId, employeeId, member: add });
 } catch (error) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2034','P2002'].includes(error.code)) return failure(409, 'CONCURRENT_CHANGE', 'Reload and try again.');
  throw error;
 }
}
export const PUT = ({ locals, params }: import('./$types').RequestEvent) => change(locals, params, true);
export const DELETE = ({ locals, params }: import('./$types').RequestEvent) => change(locals, params, false);
