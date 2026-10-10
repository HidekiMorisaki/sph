import { requireSystemAdminApi, writeAuditLog } from '$lib/server/api/admin';
import { permissionOperations } from '$lib/server/auth/permissions';
import { duplicateField, parseId } from '$lib/server/api/database';
import { readMasterSnapshot, recordMasterChange } from '$lib/server/api/master-history';
import { parseRoleNameInput } from '$lib/server/api/role-input';
import { failure, success } from '$lib/server/api/response';
import { roleOutput, roleSelect } from '$lib/server/api/role-output';
import { Prisma } from '$lib/server/generated/prisma/client';
import { getPrisma } from '$lib/server/prisma';
import { editableCodesFrom, validateEditableRolePermissions } from '$lib/server/api/role-permissions';

export async function PUT({ locals, params, request }: import('./$types').RequestEvent) {
	const actor = requireSystemAdminApi(locals.user);
	const id = parseId(params.id);
	if (!id) return failure(404, 'NOT_FOUND', 'Role not found.');
	const input: unknown = await request.json().catch(() => null);
	if (!input || typeof input !== 'object' || Array.isArray(input)) return failure(400, 'INVALID_REQUEST', 'Invalid request.');
	const { permissionScopes, expectedUpdatedAt } = input as Record<string, unknown>;
	const validated = validateEditableRolePermissions(permissionScopes);
	if (!validated.success) return failure(validated.status, validated.code, validated.message);
	if (typeof expectedUpdatedAt !== 'string' || !Number.isFinite(Date.parse(expectedUpdatedAt))) {
		return failure(400, 'INVALID_REQUEST', 'Invalid permission selection.');
	}
	const roleInput = 'name' in input || 'notes' in input ? parseRoleNameInput(input) : null;
	if (roleInput && !roleInput.success) return failure(400, 'VALIDATION_ERROR', 'One or more fields are invalid.', roleInput.errors);
	const roleData = roleInput?.success ? roleInput.data : null;
	const codes = validated.codes;
	try {
		const result = await getPrisma().$transaction(async (tx) => {
			const locked = await tx.$queryRaw<Array<{ id: number }>>`SELECT id FROM roles WHERE id = ${id} AND deleted_at IS NULL FOR UPDATE`;
			if (!locked.length) return { state: 'not_found' as const };
			const role = await tx.role.findUnique({ where: { id }, select: roleSelect });
			if (!role) return { state: 'not_found' as const };
			const before = roleOutput(role).permissionScopes;
			if (before.some(({ code }) => code === permissionOperations.systemManagement) || role.defaultKey === 'branch_administrator') return { state: 'immutable' as const };
			if (role.updatedAt.getTime() !== new Date(expectedUpdatedAt).getTime()) return { state: 'conflict' as const };
			const legacyDerived = new Set(['employees.manage', 'masters.manage', 'branches.manage', 'assets.manage', 'assets.credentials.read', 'assets.credentials.write']);
			if (before.some(({ code }) => !editableCodesFrom([code]).length && !legacyDerived.has(code))) return { state: 'unsupported' as const };
			const selected = await tx.permissionOperation.findMany({
				where: { operation: { in: codes }, deletedAt: null, permission: { deletedAt: null } },
				select: { operation: true, permissionId: true }
			});
			if (selected.length !== codes.length) return { state: 'invalid' as const };
			const beforeRole = roleData ? await readMasterSnapshot(tx, 'role', id) : null;
			const selectedIds = selected.map((entry) => entry.permissionId);
			await tx.rolePermission.updateMany({ where: { roleId: id, deletedAt: null, permissionId: { notIn: selectedIds }, permission: { operations: { none: { operation: permissionOperations.systemManagement, deletedAt: null } } } }, data: { deletedAt: new Date() } });
			for (const entry of selected) {
				const existing = await tx.rolePermission.findUnique({ where: { roleId_permissionId: { roleId: id, permissionId: entry.permissionId } }, select: { id: true, deletedAt: true } });
				const scopeType = validated.grants.find(({ code }) => code === entry.operation)!.scopeType;
				if (existing) await tx.rolePermission.update({ where: { id: existing.id }, data: { deletedAt: null, scopeType } });
				else await tx.rolePermission.create({ data: { roleId: id, permissionId: entry.permissionId, scopeType } });
			}
			await tx.role.update({ where: { id }, data: { ...roleData, updatedAt: new Date(Math.max(Date.now(), role.updatedAt.getTime() + 1)) } });
			const updated = await tx.role.findUniqueOrThrow({ where: { id }, select: roleSelect });
			const after = roleOutput(updated).permissionScopes;
			await writeAuditLog(tx, actor.id, 'update_permissions', 'role', id, { before, after });
			if (roleData) {
				await writeAuditLog(tx, actor.id, 'update', 'role', id);
				await recordMasterChange(tx, 'role', id, actor.id, 'update', beforeRole, await readMasterSnapshot(tx, 'role', id));
			}
			return { state: 'updated' as const, role: roleOutput(updated) };
		}, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
		if (result.state === 'not_found') return failure(404, 'NOT_FOUND', 'Role not found.');
		if (result.state === 'immutable') return failure(403, 'SYSTEM_ROLE_IMMUTABLE', 'The system administrator role cannot be changed.');
		if (result.state === 'conflict') return failure(409, 'STALE_ROLE', 'Role permissions changed. Reload and try again.');
		if (result.state === 'unsupported') return failure(409, 'UNSUPPORTED_PERMISSION', 'This role has an unsupported permission.');
		if (result.state === 'invalid') return failure(400, 'INVALID_REQUEST', 'Unknown permission.');
		return success(result.role);
	} catch (error) {
		return duplicateField(error)
			? failure(409, 'DUPLICATE_VALUE', 'A role with this name already exists.', [{ field: 'name', reason: 'DUPLICATE_VALUE' }])
			: failure(409, 'UPDATE_CONFLICT', 'Role permissions could not be updated. Reload and try again.');
	}
}
