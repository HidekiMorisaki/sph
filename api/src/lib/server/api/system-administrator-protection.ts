import { employeeReferenceDate } from '$lib/server/api/employee-derived';
import type { Prisma } from '$lib/server/generated/prisma/client';
import type { AuthenticatedUser } from '$lib/server/auth/types';
import { hasPermissionOperation } from '$lib/server/auth/permissions';
import { throwApiError } from './response';

// All paths that can remove an administrator use the same transaction lock.
export async function lockSystemAdministrators(tx: Prisma.TransactionClient) {
	await tx.$queryRaw`SELECT pg_advisory_xact_lock(1936746600, 1)::text`;
}

export async function isSystemAdministratorEmployee(tx: Prisma.TransactionClient, employeeId: number) {
	const grants = await tx.employeeRole.findMany({ where: { employeeId, deletedAt: null, scopeType: { in: ['global', 'own_branch'] }, role: { deletedAt: null } }, select: {
		scopeType: true, role: { select: { permissions: { where: { deletedAt: null, scopeType: 'global', permission: { deletedAt: null } }, select: { permission: { select: { operations: { where: { deletedAt: null, operation: 'system.manage' }, select: { id: true } } } } } } } }
	} });
	return grants.length === 1 && grants[0].scopeType === 'global' && grants[0].role.permissions.some(entry => entry.permission.operations.length > 0);
}

export async function protectSystemAdministrator(tx: Prisma.TransactionClient, actor: AuthenticatedUser, employeeId: number) {
	if (await isSystemAdministratorEmployee(tx, employeeId) && !hasPermissionOperation(actor, 'system.manage')) {
		throwApiError(403, 'SYSTEM_ADMINISTRATOR_PROTECTED', 'Only a system administrator can manage this employee.');
	}
}

export async function preserveSystemAdministrator(tx: Prisma.TransactionClient, employeeId: number, _effectiveAt = new Date()) {
	if (!await isSystemAdministratorEmployee(tx, employeeId)) return;
	if (!await tx.employee.count({ where: { id: employeeId, accountStatus: 'active', deletedAt: null, OR: [{ retiredAt: null }, { retiredAt: { gt: employeeReferenceDate() } }] } })) return;
	// Keeping only administrators with scheduled departures would create a later gap.
	const candidates = await tx.employee.findMany({ where: { id: { not: employeeId }, accountStatus: 'active', deletedAt: null, retiredAt: null, roleGrants: { some: { deletedAt: null, scopeType: 'global', role: { deletedAt: null, permissions: { some: { deletedAt: null, scopeType: 'global', permission: { deletedAt: null, operations: { some: { operation: 'system.manage', deletedAt: null } } } } } } } } }, select: { id: true } });
	for (const candidate of candidates) if (await isSystemAdministratorEmployee(tx, candidate.id)) return;
	throwApiError(409, 'LAST_SYSTEM_ADMINISTRATOR', 'At least one active system administrator must remain after this change.');
}
