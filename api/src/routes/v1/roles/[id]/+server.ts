import { requireSystemAdminApi, writeAuditLog } from '$lib/server/api/admin';
import { readMasterSnapshot, recordMasterChange } from '$lib/server/api/master-history';
import { duplicateField, parseId } from '$lib/server/api/database';
import { parseRoleNameInput } from '$lib/server/api/role-input';
import { failure, success } from '$lib/server/api/response';
import { getPrisma } from '$lib/server/prisma';
import { roleOutput, roleSelect } from '$lib/server/api/role-output';
import { Prisma } from '$lib/server/generated/prisma/client';

export async function PATCH({ locals, params, request }: import('./$types').RequestEvent) {
	const actor = requireSystemAdminApi(locals.user);
	const id = parseId(params.id);
	const parsed = parseRoleNameInput(await request.json().catch(() => null));
	if (!id) return failure(404, 'NOT_FOUND', 'Role not found.');
	if (!parsed.success) return failure(400, 'VALIDATION_ERROR', 'One or more fields are invalid.', parsed.errors);
	try {
		const result = await getPrisma().$transaction(async (tx) => {
			const existing = await tx.role.findFirst({ where: { id, deletedAt: null }, select: roleSelect });
			if (!existing) return { state: 'not_found' as const };
			if (roleOutput(existing).isSystemManagement || roleOutput(existing).isBranchAdministrator) return { state: 'immutable' as const };
			const before = await readMasterSnapshot(tx, 'role', id);
			const changed = await tx.role.updateMany({ where: { id, deletedAt: null }, data: parsed.data });
			if (!changed.count) return { state: 'not_found' as const };
			await writeAuditLog(tx, actor.id, 'update', 'role', id);
			await recordMasterChange(tx, 'role', id, actor.id, 'update', before, await readMasterSnapshot(tx, 'role', id));
			return { state: 'updated' as const, role: await tx.role.findUniqueOrThrow({ where: { id }, select: roleSelect }) };
		});
		if (result.state === 'immutable') return failure(403, 'SYSTEM_ROLE_IMMUTABLE', 'The system administrator role cannot be changed.');
		return result.state === 'updated' ? success(roleOutput(result.role)) : failure(404, 'NOT_FOUND', 'Role not found.');
	} catch (error) {
		return duplicateField(error)
			? failure(409, 'DUPLICATE_VALUE', 'A role with this name already exists.', [{ field: 'name', reason: 'DUPLICATE_VALUE' }])
			: failure(400, 'INVALID_REQUEST', 'Unable to update the role.');
	}
}

export async function DELETE({ locals, params }: import('./$types').RequestEvent) {
	const actor = requireSystemAdminApi(locals.user);
	const id = parseId(params.id);
	if (!id) return failure(404, 'NOT_FOUND', 'Role not found.');
	try {
		const result = await getPrisma().$transaction(async (tx) => {
			const locked = await tx.$queryRaw<Array<{ id: number }>>`SELECT id FROM roles WHERE id = ${id} AND deleted_at IS NULL FOR UPDATE`;
			if (!locked.length) return 'not_found';
			const role = await tx.role.findUniqueOrThrow({ where: { id }, select: roleSelect });
			if (roleOutput(role).isSystemManagement || roleOutput(role).isBranchAdministrator) return 'immutable';
			if (await tx.employeeRole.count({ where: { roleId: id, deletedAt: null } })) return 'referenced';
			const before = await readMasterSnapshot(tx, 'role', id);
			const now = new Date();
			await tx.rolePermission.updateMany({ where: { roleId: id, deletedAt: null }, data: { deletedAt: now } });
			await tx.role.update({ where: { id }, data: { deletedAt: now } });
			await writeAuditLog(tx, actor.id, 'delete', 'role', id);
			await recordMasterChange(tx, 'role', id, actor.id, 'delete', before, null);
			return 'deleted';
		}, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
		if (result === 'not_found') return failure(404, 'NOT_FOUND', 'Role not found.');
		if (result === 'immutable') return failure(403, 'SYSTEM_ROLE_IMMUTABLE', 'The system administrator role cannot be deleted.');
		if (result === 'referenced') return failure(409, 'RESOURCE_IN_USE', 'The role is still assigned to an employee.');
		return success({ id, deleted: true });
	} catch {
		return failure(409, 'DELETE_CONFLICT', 'The role could not be deleted. Reload and try again.');
	}
}
