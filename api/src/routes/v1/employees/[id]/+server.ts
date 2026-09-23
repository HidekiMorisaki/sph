import { requireAdminApi, writeAuditLog } from '$lib/server/api/admin';
import { parseId } from '$lib/server/api/database';
import { parseEmployeeInput } from '$lib/server/api/employee-input';
import { employeeConflictResponse } from '$lib/server/api/employee-errors';
import { employeeOutput, employeeSafeSelect } from '$lib/server/api/employee-output';
import { employeeReferenceErrors } from '$lib/server/api/employee-references';
import { syncGlobalRoleGrants } from '$lib/server/api/employee-roles';
import { getPrisma } from '$lib/server/prisma';
import { failure, success } from '$lib/server/api/response';

export async function PATCH({ params, request, locals }: import('./$types').RequestEvent) {
	const actor = requireAdminApi(locals.user); const id = parseId(params.id);
	const parsed = parseEmployeeInput(await request.json().catch(() => null));
	if (!id) return failure(400, 'INVALID_REQUEST', 'Invalid request.');
	if (!parsed.success) return failure(400, 'VALIDATION_ERROR', 'One or more fields are invalid.', parsed.errors);
	const input = parsed.data;
	try {
		const result = await getPrisma().$transaction(async (tx) => {
			const referenceErrors = await employeeReferenceErrors(tx, input.employee);
			if (referenceErrors.length) return { status: 'invalid_reference' as const, errors: referenceErrors };
			const previous = await tx.employee.findFirst({ where: { id, deletedAt: null }, select: { email: true } });
			if (!previous) return { status: 'not_found' as const };
			const roleResult = await syncGlobalRoleGrants(tx, actor, id, input.roleCodes);
			if (roleResult !== 'updated') return { status: roleResult };
			await tx.employee.update({ where: { id }, data: input.employee });
			if (previous.email !== input.employee.email) await tx.accountInvitation.updateMany({ where: { employeeId: id, usedAt: null, deletedAt: null }, data: { deletedAt: new Date() } });
			await writeAuditLog(tx, actor.id, 'update', 'employee', id);
			await writeAuditLog(tx, actor.id, 'update_roles', 'employee', id);
			return { status: 'updated' as const, item: await tx.employee.findUniqueOrThrow({ where: { id }, select: employeeSafeSelect }) };
		}, { isolationLevel: 'Serializable' });
		if (result.status === 'system_role_forbidden') return failure(403, 'ROLE_ASSIGNMENT_FORBIDDEN', 'Only system administrators can assign or remove the system administrator role.');
		if (result.status === 'last_system_administrator') return failure(409, 'LAST_SYSTEM_ADMINISTRATOR', 'The last system administrator role cannot be removed.');
		if (result.status === 'invalid_reference') return failure(400, 'VALIDATION_ERROR', 'One or more fields are invalid.', result.errors);
		if (result.status !== 'updated') return failure(404, 'NOT_FOUND', 'Not found.');
		return success(employeeOutput(result.item));
	} catch (error) {
		return employeeConflictResponse(error) ?? failure(400, 'INVALID_REQUEST', 'Invalid request.');
	}
}

export async function DELETE({ params, locals }: import('./$types').RequestEvent) {
	const actor = requireAdminApi(locals.user); const id = parseId(params.id);
	if (!id) return failure(404, 'NOT_FOUND', 'Not found.');
	const result = await getPrisma().$transaction(async (tx) => {
		const targetIsSystemAdmin = await tx.employeeRole.count({ where: { employeeId: id, deletedAt: null, scopeType: 'global', role: { code: 'system_administrator', deletedAt: null } } });
		if (targetIsSystemAdmin) {
			const otherSystemAdmins = await tx.employeeRole.count({ where: { employeeId: { not: id }, deletedAt: null, scopeType: 'global', role: { code: 'system_administrator', deletedAt: null }, employee: { accountStatus: 'active', deletedAt: null } } });
			if (!otherSystemAdmins) return 'last_admin';
		}
		const activeAssignments = await Promise.all([
			tx.deskAssignment.count({ where: { employeeId: id, returnedAt: null, deletedAt: null } }),
			tx.chairAssignment.count({ where: { employeeId: id, returnedAt: null, deletedAt: null } }),
			tx.itAssetAssignment.count({ where: { employeeId: id, returnedAt: null, deletedAt: null } })
		]);
		if (activeAssignments.some((count) => count > 0)) return 'referenced';
		const changed = await tx.employee.updateMany({ where: { id, deletedAt: null }, data: { deletedAt: new Date() } });
		if (!changed.count) return 'not_found';
		await tx.session.updateMany({ where: { employeeId: id, deletedAt: null }, data: { deletedAt: new Date() } });
		await tx.accountInvitation.updateMany({ where: { employeeId: id, usedAt: null, deletedAt: null }, data: { deletedAt: new Date() } });
		await writeAuditLog(tx, actor.id, 'delete', 'employee', id); return 'deleted';
	}, { isolationLevel: 'Serializable' });
	if (result === 'referenced') return failure(409, 'RESOURCE_IN_USE', 'The employee has an active assignment.');
	if (result === 'last_admin') return failure(409, 'LAST_SYSTEM_ADMINISTRATOR', 'The last system administrator cannot be deleted.');
	return result === 'deleted' ? success({ id, deleted: true }) : failure(404, 'NOT_FOUND', 'Not found.');
}
