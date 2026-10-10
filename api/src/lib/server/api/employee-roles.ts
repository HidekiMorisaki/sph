import type { AuthenticatedUser } from '$lib/server/auth/types';
import { hasPermissionOperation, permissionOperations } from '$lib/server/auth/permissions';
import type { Prisma } from '$lib/server/generated/prisma/client';
import { getPrisma } from '$lib/server/prisma';

export type RoleSyncResult = 'updated' | 'roles_not_found' | 'system_role_forbidden' | 'last_system_administrator';

const systemPermissionRelation = {
	some: {
		deletedAt: null,
		permission: {
			deletedAt: null,
			operations: { some: { operation: permissionOperations.systemManagement, deletedAt: null } }
		}
	}
} as const;

type RoleWithPermissions = {
	id: number;
	defaultKey: string | null;
	permissions: Array<{ permission: { operations: Array<{ operation: string }> } }>;
};

function isSystemManagementRole(role: RoleWithPermissions): boolean {
	return role.permissions.some((entry) => entry.permission.operations.some((operation) => operation.operation === permissionOperations.systemManagement));
}

const permissionSelect = {
	where: { deletedAt: null, permission: { deletedAt: null } },
	select: { permission: { select: { operations: { where: { deletedAt: null }, select: { operation: true } } } } }
} as const;

async function lockRequestedRoles(tx: Prisma.TransactionClient, roleIds: number[]): Promise<boolean> {
	for (const id of [...new Set(roleIds)].sort((left, right) => left - right)) {
		const locked = await tx.$queryRaw<Array<{ id: number }>>`SELECT id FROM roles WHERE id = ${id} AND deleted_at IS NULL FOR UPDATE`;
		if (!locked.length) return false;
	}
	return true;
}

export async function canAssignRequestedRoles(actor: AuthenticatedUser, roleIds: number[]): Promise<boolean> {
	if (roleIds.length !== 1) return false;
	if (hasPermissionOperation(actor, 'roles.assign') && hasPermissionOperation(actor, permissionOperations.systemManagement)) return true;
	return await getPrisma().role.count({ where: { id: roleIds[0], defaultKey: 'general_user', deletedAt: null } }) === 1;
}

export async function createGlobalRoleGrants(
	tx: Prisma.TransactionClient,
	employeeId: number,
	roleIds: number[]
): Promise<boolean> {
	if (roleIds.length !== 1) return false;
	if (!await lockRequestedRoles(tx, roleIds)) return false;
	const roles = await tx.role.findMany({ where: { id: { in: roleIds }, deletedAt: null }, select: { id: true, defaultKey: true } });
	if (roles.length !== roleIds.length) return false;
	await tx.employeeRole.createMany({ data: roles.map((role) => ({ employeeId, roleId: role.id, scopeType: role.defaultKey === 'branch_administrator' ? 'own_branch' : 'global', scopeKey: role.defaultKey === 'branch_administrator' ? 'own_branch' : 'global' })) });
	return true;
}

export async function syncGlobalRoleGrants(
	tx: Prisma.TransactionClient,
	actor: AuthenticatedUser,
	employeeId: number,
	roleIds: number[]
): Promise<RoleSyncResult> {
	if (roleIds.length !== 1) return 'roles_not_found';
	await tx.$queryRaw`SELECT id FROM employees WHERE id = ${employeeId} FOR UPDATE`;
	if (!await lockRequestedRoles(tx, roleIds)) return 'roles_not_found';
	const [roles, currentGrants] = await Promise.all([
		tx.role.findMany({ where: { id: { in: roleIds }, deletedAt: null }, select: { id: true, defaultKey: true, permissions: permissionSelect } }),
		tx.employeeRole.findMany({ where: { employeeId, scopeType: { in: ['global', 'own_branch'] }, deletedAt: null, role: { deletedAt: null } }, select: { role: { select: { id: true, defaultKey: true, permissions: permissionSelect } } } })
	]);
	if (roles.length !== roleIds.length) return 'roles_not_found';
	const changingRole = currentGrants.length !== 1 || currentGrants[0].role.id !== roles[0].id;
	if (changingRole && (!hasPermissionOperation(actor, 'roles.assign') || !hasPermissionOperation(actor, permissionOperations.systemManagement))) return 'system_role_forbidden';

	const currentHasSystemRole = currentGrants.some((grant) => isSystemManagementRole(grant.role));
	const requestedHasSystemRole = roles.some(isSystemManagementRole);
	if (!hasPermissionOperation(actor, permissionOperations.systemManagement) && currentHasSystemRole !== requestedHasSystemRole) return 'system_role_forbidden';
	if (!hasPermissionOperation(actor, permissionOperations.systemManagement) &&
		currentGrants.some((grant) => grant.role.defaultKey === 'branch_administrator') !== roles.some((role) => role.defaultKey === 'branch_administrator')) return 'system_role_forbidden';

	if (currentHasSystemRole && !requestedHasSystemRole) {
		const otherSystemAdministrators = await tx.employeeRole.count({
			where: {
				employeeId: { not: employeeId },
				deletedAt: null,
				scopeType: 'global',
				role: { deletedAt: null, permissions: systemPermissionRelation },
				employee: { accountStatus: 'active', deletedAt: null }
			}
		});
		if (!otherSystemAdministrators) return 'last_system_administrator';
	}

	await tx.employeeRole.updateMany({
		where: { employeeId, deletedAt: null, OR: [
			{ roleId: { notIn: roleIds } },
			{ roleId: roleIds[0], scopeType: { not: roles[0].defaultKey === 'branch_administrator' ? 'own_branch' : 'global' } }
		] },
		data: { deletedAt: new Date() }
	});
	for (const role of roles) {
		const scopeType = role.defaultKey === 'branch_administrator' ? 'own_branch' : 'global';
		const existing = await tx.employeeRole.findUnique({
			where: { employeeId_roleId_scopeType_scopeKey: { employeeId, roleId: role.id, scopeType, scopeKey: scopeType } },
			select: { id: true, deletedAt: true }
		});
		if (existing) {
			if (existing.deletedAt) await tx.employeeRole.update({ where: { id: existing.id }, data: { deletedAt: null } });
		} else {
			await tx.employeeRole.create({ data: { employeeId, roleId: role.id, scopeType, scopeKey: scopeType } });
		}
	}
	return 'updated';
}
