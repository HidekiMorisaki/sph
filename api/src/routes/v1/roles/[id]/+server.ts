import { requireSystemAdminApi, writeAuditLog } from '$lib/server/api/admin';
import { duplicateField, parseId } from '$lib/server/api/database';
import { parseRoleNameInput } from '$lib/server/api/role-input';
import { failure, success } from '$lib/server/api/response';
import { getPrisma } from '$lib/server/prisma';
import { roleOutput, roleSelect } from '$lib/server/api/role-output';

export async function PATCH({ locals, params, request }: import('./$types').RequestEvent) {
	const actor = requireSystemAdminApi(locals.user);
	const id = parseId(params.id);
	const parsed = parseRoleNameInput(await request.json().catch(() => null));
	if (!id) return failure(404, 'NOT_FOUND', 'Role not found.');
	if (!parsed.success) return failure(400, 'VALIDATION_ERROR', 'One or more fields are invalid.', parsed.errors);
	try {
		const item = await getPrisma().$transaction(async (tx) => {
			const changed = await tx.role.updateMany({ where: { id, deletedAt: null }, data: parsed.data });
			if (!changed.count) return null;
			await writeAuditLog(tx, actor.id, 'update', 'role', id);
			return tx.role.findUnique({ where: { id }, select: roleSelect });
		});
		return item ? success(roleOutput(item)) : failure(404, 'NOT_FOUND', 'Role not found.');
	} catch (error) {
		return duplicateField(error)
			? failure(409, 'DUPLICATE_VALUE', 'A role with this name already exists.', [{ field: 'name', reason: 'DUPLICATE_VALUE' }])
			: failure(400, 'INVALID_REQUEST', 'Unable to update the role.');
	}
}
