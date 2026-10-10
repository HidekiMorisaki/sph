import { permissionOperations } from '$lib/server/auth/permissions';
import defaultRoles from '$lib/server/auth/default-role-permissions.json';
import granularOperations from '$lib/server/auth/granular-operations.json';
import { editableCodesFrom } from './role-permissions';
import type { Prisma } from '$lib/server/generated/prisma/client';

export const roleSelect = {
	id: true,
	name: true,
	defaultKey: true,
	notes: true,
	createdAt: true,
	updatedAt: true,
	permissions: {
		where: { deletedAt: null, permission: { deletedAt: null } },
		select: { scopeType: true, permission: { select: { operations: { where: { deletedAt: null }, select: { operation: true } } } } }
	}
} satisfies Prisma.RoleSelect;

type RoleRecord = Prisma.RoleGetPayload<{ select: typeof roleSelect }>;

export function roleOutput({ permissions, defaultKey, ...role }: RoleRecord) {
	const permissionCodes = [...new Set(permissions.flatMap((entry) => entry.permission.operations.map((operation) => operation.operation)))].sort();
	const permissionScopes = permissions.flatMap((entry) => entry.permission.operations.map(({ operation }) => ({ code: operation, scopeType: entry.scopeType as 'global' | 'own_branch' }))).sort((a, b) => a.code.localeCompare(b.code));
	const defaultRole = defaultRoles.find((entry) => entry.key === defaultKey);
	const defaultPermissionCodes = defaultRole ? [...defaultRole.permissionCodes,
		...granularOperations.filter((operation) => (!operation.systemOnly || defaultKey === 'system_administrator' || (defaultKey === 'branch_administrator' && ['branches.update', 'branches.delete'].includes(operation.code))) &&
			(Array.isArray(operation.prerequisite) ? operation.prerequisite : [operation.prerequisite]).some((code) => defaultRole.permissionCodes.includes(code)))
			.map((operation) => operation.code)].sort() : null;
	return {
		...role,
		permissionCodes,
		permissionScopes,
		editablePermissionScopes: permissionScopes.filter(({ code }) => editableCodesFrom([code]).length > 0),
		editablePermissionCodes: editableCodesFrom(permissionCodes),
		defaultPermissionCodes,
		isSystemManagement: permissionCodes.includes(permissionOperations.systemManagement),
		isBranchAdministrator: defaultKey === 'branch_administrator',
		isGeneralUser: defaultKey === 'general_user'
	};
}
