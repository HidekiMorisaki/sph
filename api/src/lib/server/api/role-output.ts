import { permissionOperations } from '$lib/server/auth/permissions';
import type { Prisma } from '$lib/server/generated/prisma/client';

export const roleSelect = {
	id: true,
	name: true,
	createdAt: true,
	updatedAt: true,
	permissions: {
		where: { deletedAt: null, permission: { deletedAt: null } },
		select: { permission: { select: { operations: { where: { deletedAt: null }, select: { operation: true } } } } }
	}
} satisfies Prisma.RoleSelect;

type RoleRecord = Prisma.RoleGetPayload<{ select: typeof roleSelect }>;

export function roleOutput({ permissions, ...role }: RoleRecord) {
	return {
		...role,
		isSystemManagement: permissions.some((entry) => entry.permission.operations.some((operation) => operation.operation === permissionOperations.systemManagement))
	};
}
