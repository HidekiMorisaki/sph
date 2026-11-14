import { derivedPermissionCodes, normalizePermissionScopes } from '#lib/server/auth/permission-dependencies.js';
import { requireOperationApi, requireSystemAdminApi, writeAuditLog } from '#lib/server/api/admin.js';
import { permissionOperations, isSystemOnlyOperation } from '#lib/server/auth/permissions.js';
import { duplicateField, parseId } from '#lib/server/api/database.js';
import { readMasterSnapshot, recordMasterChange } from '#lib/server/api/master-history.js';
import { parseRoleNameInput } from '#lib/server/api/role-input.js';
import { failure, success } from '#lib/server/api/response.js';
import { roleOutput, roleSelect } from '#lib/server/api/role-output.js';
import { Prisma } from '#lib/server/generated/prisma/client.js';
import { getPrisma } from '#lib/server/prisma.js';
import { editableCodesFrom, validateEditableRolePermissions } from '#lib/server/api/role-permissions.js';

export async function PUT({ locals, params, request }: import('./$types').RequestEvent) {
	const actor = requireSystemAdminApi(locals.user);
	const id = parseId(params.id);
	if (!id) return failure(404, 'NOT_FOUND', 'Role not found.');
	const input: unknown = await request.json().catch(() => null);
	if (!input || typeof input !== 'object' || Array.isArray(input)) return failure(400, 'INVALID_REQUEST', 'Invalid request.');
	const { permissionScopes, expectedUpdatedAt } = input as Record<string, unknown>;
	if (typeof expectedUpdatedAt !== 'string' || !Number.isFinite(Date.parse(expectedUpdatedAt))) {
		return failure(400, 'INVALID_REQUEST', 'Invalid permission selection.');
	}
	const roleInput = 'name' in input || 'notes' in input ? parseRoleNameInput(input) : null;
	if (roleInput && !roleInput.success) return failure(400, 'VALIDATION_ERROR', 'One or more fields are invalid.', roleInput.errors);
	const roleData = roleInput?.success ? roleInput.data : null;
	if (roleData) requireOperationApi(actor, 'roles.update');
	try {
		const result = await getPrisma().$transaction(async (tx) => {
			const locked = await tx.$queryRaw<Array<{ id: number }>>`SELECT id FROM roles WHERE id = ${id} AND deleted_at IS NULL FOR UPDATE`;
			if (!locked.length) return { state: 'not_found' as const };
			const role = await tx.role.findUnique({ where: { id }, select: roleSelect });
			if (!role) return { state: 'not_found' as const };
			const before = roleOutput(role).permissionScopes;
			if (roleOutput(role).isSystemManagement) return { state: 'immutable' as const };
			const branchAdministrator = role.defaultKey === 'branch_administrator';
			const validated = validateEditableRolePermissions(permissionScopes, branchAdministrator);
			if (!validated.success) return { state: 'invalid_input' as const, validation: validated };
			// Preserve dormant system-only legacy grants without making them editable or effective.
			const retained = before.filter(({ code }) => isSystemOnlyOperation(code));
			const grants = normalizePermissionScopes([...validated.grants, ...retained]);
			const codes = grants.map(({ code }) => code);
			if (role.updatedAt.getTime() !== new Date(expectedUpdatedAt).getTime()) return { state: 'conflict' as const };
			const legacyDerived = derivedPermissionCodes;
			if (before.some(({ code }) => !editableCodesFrom([code], branchAdministrator).length && !legacyDerived.has(code) && !isSystemOnlyOperation(code))) return { state: 'unsupported' as const };
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
				const scopeType = grants.find(({ code }) => code === entry.operation)!.scopeType;
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
		if (result.state === 'invalid_input') return failure(result.validation.status, result.validation.code, result.validation.message);
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
