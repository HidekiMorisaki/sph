import type { AuthenticatedUser } from '$lib/server/auth/types';
import type { Prisma } from '$lib/server/generated/prisma/client';
import type { EmployeeRoleCode } from '$lib/server/api/employee-input';

export type RoleSyncResult = 'updated' | 'roles_not_found' | 'system_role_forbidden' | 'last_system_administrator';

export function canAssignRequestedRoles(actor: AuthenticatedUser, roleCodes: EmployeeRoleCode[]): boolean {
	return actor.roles.includes('system_administrator') || !roleCodes.includes('system_administrator');
}

export async function createGlobalRoleGrants(
	tx: Prisma.TransactionClient,
	employeeId: number,
	roleCodes: EmployeeRoleCode[]
): Promise<boolean> {
	const roles = await tx.role.findMany({ where: { code: { in: roleCodes }, deletedAt: null }, select: { id: true } });
	if (roles.length !== roleCodes.length) return false;
	await tx.employeeRole.createMany({ data: roles.map((role) => ({ employeeId, roleId: role.id, scopeType: 'global', scopeKey: 'global' })) });
	return true;
}

export async function syncGlobalRoleGrants(
	tx: Prisma.TransactionClient,
	actor: AuthenticatedUser,
	employeeId: number,
	roleCodes: EmployeeRoleCode[]
): Promise<RoleSyncResult> {
	const [roles, currentGrants] = await Promise.all([
		tx.role.findMany({ where: { code: { in: roleCodes }, deletedAt: null }, select: { id: true, code: true } }),
		tx.employeeRole.findMany({ where: { employeeId, scopeType: 'global', deletedAt: null, role: { deletedAt: null } }, select: { role: { select: { code: true } } } })
	]);
	if (roles.length !== roleCodes.length) return 'roles_not_found';

	const currentHasSystemRole = currentGrants.some((grant) => grant.role.code === 'system_administrator');
	const requestedHasSystemRole = roleCodes.includes('system_administrator');
	if (!actor.roles.includes('system_administrator') && currentHasSystemRole !== requestedHasSystemRole) return 'system_role_forbidden';

	if (currentHasSystemRole && !requestedHasSystemRole) {
		const otherSystemAdministrators = await tx.employeeRole.count({
			where: {
				employeeId: { not: employeeId },
				deletedAt: null,
				scopeType: 'global',
				role: { code: 'system_administrator', deletedAt: null },
				employee: { accountStatus: 'active', deletedAt: null }
			}
		});
		if (!otherSystemAdministrators) return 'last_system_administrator';
	}

	const roleIds = roles.map((role) => role.id);
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
