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
	permissions: Array<{ permission: { operations: Array<{ operation: string }> } }>;
};

function isSystemManagementRole(role: RoleWithPermissions): boolean {
	return role.permissions.some((entry) => entry.permission.operations.some((operation) => operation.operation === permissionOperations.systemManagement));
}

const permissionSelect = {
	where: { deletedAt: null, permission: { deletedAt: null } },
	select: { permission: { select: { operations: { where: { deletedAt: null }, select: { operation: true } } } } }
} as const;

export async function canAssignRequestedRoles(actor: AuthenticatedUser, roleIds: number[]): Promise<boolean> {
	if (hasPermissionOperation(actor, permissionOperations.systemManagement)) return true;
	return await getPrisma().role.count({ where: { id: { in: roleIds }, deletedAt: null, permissions: systemPermissionRelation } }) === 0;
}

export async function createGlobalRoleGrants(
	tx: Prisma.TransactionClient,
	employeeId: number,
	roleIds: number[]
): Promise<boolean> {
	const roles = await tx.role.findMany({ where: { id: { in: roleIds }, deletedAt: null }, select: { id: true } });
	if (roles.length !== roleIds.length) return false;
	await tx.employeeRole.createMany({ data: roles.map((role) => ({ employeeId, roleId: role.id, scopeType: 'global', scopeKey: 'global' })) });
	return true;
}

export async function syncGlobalRoleGrants(
	tx: Prisma.TransactionClient,
	actor: AuthenticatedUser,
	employeeId: number,
	roleIds: number[]
): Promise<RoleSyncResult> {
	const [roles, currentGrants] = await Promise.all([
		tx.role.findMany({ where: { id: { in: roleIds }, deletedAt: null }, select: { id: true, permissions: permissionSelect } }),
		tx.employeeRole.findMany({ where: { employeeId, scopeType: 'global', deletedAt: null, role: { deletedAt: null } }, select: { role: { select: { id: true, permissions: permissionSelect } } } })
	]);
	if (roles.length !== roleIds.length) return 'roles_not_found';

	const currentHasSystemRole = currentGrants.some((grant) => isSystemManagementRole(grant.role));
	const requestedHasSystemRole = roles.some(isSystemManagementRole);
	if (!hasPermissionOperation(actor, permissionOperations.systemManagement) && currentHasSystemRole !== requestedHasSystemRole) return 'system_role_forbidden';

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
		where: { employeeId, scopeType: 'global', deletedAt: null, roleId: { notIn: roleIds } },
		data: { deletedAt: new Date() }
	});
	for (const role of roles) {
		const existing = await tx.employeeRole.findUnique({
			where: { employeeId_roleId_scopeType_scopeKey: { employeeId, roleId: role.id, scopeType: 'global', scopeKey: 'global' } },
			select: { id: true, deletedAt: true }
		});
		if (existing) {
			if (existing.deletedAt) await tx.employeeRole.update({ where: { id: existing.id }, data: { deletedAt: null } });
		} else {
			await tx.employeeRole.create({ data: { employeeId, roleId: role.id, scopeType: 'global', scopeKey: 'global' } });
		}
	}
	return 'updated';
}
