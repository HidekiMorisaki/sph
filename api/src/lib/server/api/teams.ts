import { Prisma } from '$lib/server/generated/prisma/client';
import type { AuthenticatedUser } from '$lib/server/auth/types';
import { hasScopedPermissionOperation } from '$lib/server/auth/permissions';
import { requireOperationApi, writeAuditLog } from './admin';
import { failure, throwApiError } from './response';
import { getPrisma } from '$lib/server/prisma';

export async function teamConflictResponse(error: unknown, name: string, excludeId = 0) {
 if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') return null;
 const rows = await getPrisma().$queryRaw<Array<{ exists: boolean }>>`SELECT EXISTS (
  SELECT 1 FROM teams WHERE deleted_at IS NULL AND id <> ${excludeId} AND lower(btrim(name)) = lower(btrim(${name}))
 ) AS exists`;
 return rows[0]?.exists
  ? failure(409, 'TEAM_NAME_CONFLICT', 'An active team already uses this name.', [{ field: 'name', reason: 'DUPLICATE_VALUE' }])
  : failure(409, 'CONCURRENT_CHANGE', 'Reload and try again.');
}

export const teamSelect = { id: true, name: true, description: true, createdAt: true, updatedAt: true } satisfies Prisma.TeamSelect;

export function parseTeam(value: unknown) {
 if (!value || typeof value !== 'object' || Array.isArray(value)) throwApiError(422, 'VALIDATION_ERROR', 'Invalid team.');
 const body = value as Record<string, unknown>;
 if(Object.hasOwn(body,'code'))throwApiError(422,'VALIDATION_ERROR','Team code is an internal identifier.',[{field:'code',reason:'READ_ONLY'}]);
 const name = typeof body.name === 'string' ? body.name.trim() : '';
 const description = body.description == null ? null : typeof body.description === 'string' ? body.description.trim() || null : undefined;
 if (!name || name.length > 128) throwApiError(422, 'VALIDATION_ERROR', 'Invalid team name.', [{ field: 'name', reason: 'INVALID_NAME' }]);
 if (description === undefined || (description?.length ?? 0) > 5000) throwApiError(422, 'VALIDATION_ERROR', 'Invalid description.', [{ field: 'description', reason: 'TOO_LONG' }]);
 return { name, description };
}

export function parseTeamIds(value: unknown): number[] | undefined {
 if (value === undefined) return undefined;
 if (!Array.isArray(value) || value.length > 500) throwApiError(422, 'VALIDATION_ERROR', 'Invalid teams.', [{ field: 'teamIds', reason: 'INVALID_TEAMS' }]);
 const ids = value.map(item => typeof item === 'number' ? item : typeof item === 'string' && /^[1-9]\d*$/.test(item) ? Number(item) : NaN);
 if (ids.some(id => !Number.isSafeInteger(id) || id < 1) || new Set(ids).size !== ids.length) throwApiError(422, 'VALIDATION_ERROR', 'Invalid teams.', [{ field: 'teamIds', reason: 'INVALID_TEAMS' }]);
 return ids;
}

// Check every changed membership before writing; an omitted field preserves membership.
export async function syncEmployeeTeams(tx: Prisma.TransactionClient, actor: AuthenticatedUser, employeeId: number, teamIds: number[] | undefined) {
 if (teamIds === undefined) return;
 const employee = await tx.employee.findFirst({ where: { id: employeeId, deletedAt: null }, select: { branchId: true } });
 if (!employee) throwApiError(404, 'NOT_FOUND', 'Not found.');
 const current = await tx.employeeTeam.findMany({ where: { employeeId, deletedAt: null, team: { deletedAt: null } }, select: { teamId: true } });
 const existingIds = current.map(item => item.teamId);
 const additions = teamIds.filter(id => !existingIds.includes(id));
 const removals = existingIds.filter(id => !teamIds.includes(id));
 if (additions.length || removals.length) teamReader(actor);
 for (const [ids, operation] of [[additions, 'teams.members.add'], [removals, 'teams.members.remove']] as const) {
  if (ids.length && !hasScopedPermissionOperation(actor, operation, employee.branchId)) throwApiError(403, 'PERMISSION_REQUIRED', 'Permission is required.');
 }
 if (await tx.team.count({ where: { id: { in: teamIds }, deletedAt: null } }) !== teamIds.length) throwApiError(422, 'VALIDATION_ERROR', 'Invalid teams.', [{ field: 'teamIds', reason: 'INVALID_TEAMS' }]);
 if (removals.length) await tx.employeeTeam.updateMany({ where: { employeeId, teamId: { in: removals }, deletedAt: null }, data: { deletedAt: new Date() } });
 for (const teamId of additions) await tx.employeeTeam.upsert({ where: { employeeId_teamId: { employeeId, teamId } }, create: { employeeId, teamId }, update: { deletedAt: null } });
 if (additions.length || removals.length) await writeAuditLog(tx, actor.id, 'update_memberships', 'employee', employeeId, { addedTeamIds: additions, removedTeamIds: removals });
}

export function teamReader(user: AuthenticatedUser | null) { return requireOperationApi(user, 'teams.read'); }

export function readableMembersWhere(actor: AuthenticatedUser): Prisma.EmployeeWhereInput {
 if (actor.permissionOperations.includes('employees.read')) return { deletedAt: null };
 if (actor.ownBranchPermissionOperations.includes('employees.read')) return { deletedAt: null, branchId: actor.branchId };
 // No employee read permission: counts and candidates must not disclose employees.
 return { id: -1 };
}
