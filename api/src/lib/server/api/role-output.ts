import { permissionOperations } from '$lib/server/auth/permissions';
import defaultRoles from '$lib/server/auth/default-role-permissions.json';
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
		select: { permission: { select: { operations: { where: { deletedAt: null }, select: { operation: true } } } } }
	}
} satisfies Prisma.RoleSelect;

type RoleRecord = Prisma.RoleGetPayload<{ select: typeof roleSelect }>;

export function roleOutput({ permissions, defaultKey, ...role }: RoleRecord) {
	const permissionCodes = [...new Set(permissions.flatMap((entry) => entry.permission.operations.map((operation) => operation.operation)))].sort();
	const defaultPermissionCodes = defaultRoles.find((defaultRole) => defaultRole.key === defaultKey)?.permissionCodes ?? null;
	return {
		...role,
		permissionCodes,
		defaultPermissionCodes,
		isSystemManagement: permissionCodes.includes(permissionOperations.systemManagement)
	};
}
