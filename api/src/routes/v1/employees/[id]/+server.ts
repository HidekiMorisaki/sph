import { isSystemAdministratorEmployee, lockSystemAdministrators, protectSystemAdministrator, preserveSystemAdministrator } from '#lib/server/api/system-administrator-protection.js';
import { returnDepartureAssets, ensureAssetsReturned, deleteEmployeeRecord } from '#lib/server/api/employee-offboarding.js';
import { isHttpError } from '@sveltejs/kit';
import { syncEmployeeTeams } from '#lib/server/api/teams.js';
import { writeAuditLog } from '#lib/server/api/admin.js';
import { requireScopedOperationApi } from '#lib/server/api/branch-access.js';
import { hasScopedPermissionOperation, permissionOperations } from '#lib/server/auth/permissions.js';
import { parseId } from '#lib/server/api/database.js';
import { parseEmployeeInput } from '#lib/server/api/employee-input.js';
import { employeeConflictResponse } from '#lib/server/api/employee-errors.js';
import { readEmployeeFields, recordEmployeeChange } from '#lib/server/api/employee-history.js';
import { employeeOutput, employeeSafeSelect } from '#lib/server/api/employee-output.js';
import { syncEmployeeDepartments } from '#lib/server/api/employee-departments.js';
import { syncEmployeePositions } from '#lib/server/api/employee-positions.js';
import { employeeReferenceErrors } from '#lib/server/api/employee-references.js';
import { syncGlobalRoleGrants } from '#lib/server/api/employee-roles.js';
import { getPrisma } from '#lib/server/prisma.js';
import { failure, success } from '#lib/server/api/response.js';

export async function GET({ params, locals }: import('./$types').RequestEvent) {
	const { actor: viewer, branchId } = requireScopedOperationApi(locals.user, permissionOperations.employeeRead);
	const id = parseId(params.id);
	if (!id) return failure(404, 'NOT_FOUND', 'Not found.');
	const item = await getPrisma().employee.findFirst({ where: { id, deletedAt: null, ...(branchId === null ? {} : { branchId }) }, select: employeeSafeSelect });
	if (!item) return failure(404, 'NOT_FOUND', 'Not found.');
	const protectedTarget = await isSystemAdministratorEmployee(getPrisma(), id) && !viewer.permissionOperations.includes('system.manage');
	const allowedOperations = { update: !protectedTarget && hasScopedPermissionOperation(viewer, 'employees.update', item.branchId) && hasScopedPermissionOperation(viewer, 'employees.manage', item.branchId), delete: !protectedTarget && hasScopedPermissionOperation(viewer, 'employees.delete', item.branchId) && hasScopedPermissionOperation(viewer, 'employees.manage', item.branchId), invite: !protectedTarget && hasScopedPermissionOperation(viewer, 'employees.invite', item.branchId) && hasScopedPermissionOperation(viewer, 'employees.manage', item.branchId) };
	const response = success({ ...employeeOutput(item, undefined, viewer.permissionOperations.includes('teams.read')), allowedOperations });
	response.headers.set('Cache-Control', 'no-store');
	return response;
}

export async function PATCH({ params, request, locals }: import('./$types').RequestEvent) {
	const { actor, branchId: writerBranchId } = requireScopedOperationApi(locals.user, permissionOperations.employeeManagement); const id = parseId(params.id);
	if (!id) return failure(400, 'INVALID_REQUEST', 'Invalid request.');
	const current = await getPrisma().employee.findFirst({ where: { id, deletedAt: null, ...(writerBranchId === null ? {} : { branchId: writerBranchId }) }, select: { countryCode: true } });
	if (!current) return failure(404, 'NOT_FOUND', 'Not found.');
	const body = await request.json().catch(() => null);
	const parsed = parseEmployeeInput(body, current.countryCode === 'US' ? 'US' : 'JP');
	if (!parsed.success) return failure(400, 'VALIDATION_ERROR', 'One or more fields are invalid.', parsed.errors);
	const input = parsed.data;
	if (writerBranchId !== null && input.employee.branchId !== writerBranchId) return failure(403, 'BRANCH_ACCESS_DENIED', 'Branch access is required.');
	try {
		const result = await getPrisma().$transaction(async (tx) => {
			await lockSystemAdministrators(tx);
			await tx.$queryRaw`SELECT id FROM employees WHERE id = ${id} FOR UPDATE`;
			await protectSystemAdministrator(tx, actor, id);
			const referenceErrors = await employeeReferenceErrors(tx, { ...input.employee, departmentIds: input.departmentIds, primaryDepartmentId: input.primaryDepartmentId, positionIds: input.positionIds });
			if (referenceErrors.length) return { status: 'invalid_reference' as const, errors: referenceErrors };
			const previous = await tx.employee.findFirst({ where: { id, deletedAt: null, ...(writerBranchId === null ? {} : { branchId: writerBranchId }) }, select: { email: true, retiredAt: true, deletionScheduledOn: true } });
			if (!previous) return { status: 'not_found' as const };
			if (writerBranchId !== null && await tx.employeeRole.count({ where: { employeeId: id, deletedAt: null, scopeType: 'global', role: { deletedAt: null, permissions: { some: { deletedAt: null, permission: { deletedAt: null, operations: { some: { operation: permissionOperations.systemManagement, deletedAt: null } } } } } } } })) return { status: 'system_role_forbidden' as const };
			const retirementChanged = input.employee.retiredAt && input.employee.retiredAt.getTime() !== previous.retiredAt?.getTime();
			if (retirementChanged) await preserveSystemAdministrator(tx,id,input.employee.retiredAt!);
			const before = await readEmployeeFields(tx, id);
			let roleResult: Awaited<ReturnType<typeof syncGlobalRoleGrants>> = 'updated';
			if (writerBranchId === null) roleResult = await syncGlobalRoleGrants(tx, actor, id, input.roleIds);
			else {
				const current = await tx.employeeRole.findMany({ where: { employeeId: id, deletedAt: null, scopeType: { in: ['global', 'own_branch'] } }, select: { roleId: true } });
				if (current.length !== input.roleIds.length || current.some(({ roleId }) => !input.roleIds.includes(roleId))) roleResult = 'system_role_forbidden';
			}
			if (roleResult !== 'updated') return { status: roleResult };
			if (retirementChanged) await returnDepartureAssets(tx,id,actor,(body as Record<string,unknown>)?.departureConfirmation,input.employee.retiredAt!);
			await syncEmployeeTeams(tx, actor, id, input.teamIds);
			if (input.employee.retiredAt) await preserveSystemAdministrator(tx, id, input.employee.retiredAt > new Date() ? input.employee.retiredAt : new Date());
			await tx.employee.update({ where: { id }, data: { ...input.employee, ...(!input.employee.retiredAt && !previous.deletionScheduledOn ? {assetReturnCompletedAt:null} : {}) } });
			await syncEmployeeDepartments(tx, id, input.departmentIds, input.primaryDepartmentId);
			await syncEmployeePositions(tx, id, input.positionIds, input.primaryPositionId);
			if (previous.email !== input.employee.email) await tx.accountInvitation.updateMany({ where: { employeeId: id, usedAt: null, deletedAt: null }, data: { deletedAt: new Date() } });
			await recordEmployeeChange(tx, id, actor.id, 'update', before, await readEmployeeFields(tx, id));
			await writeAuditLog(tx, actor.id, 'update', 'employee', id);
			await writeAuditLog(tx, actor.id, 'update_roles', 'employee', id);
			return { status: 'updated' as const, item: await tx.employee.findUniqueOrThrow({ where: { id }, select: employeeSafeSelect }) };
		}, { isolationLevel: 'Serializable' });
		if (result.status === 'system_role_forbidden') return failure(403, 'ROLE_ASSIGNMENT_FORBIDDEN', 'Only system administrators can assign or remove the system administrator role.');
		if (result.status === 'last_system_administrator') return failure(409, 'LAST_SYSTEM_ADMINISTRATOR', 'The last system administrator role cannot be removed.');
		if (result.status === 'invalid_reference') return failure(400, 'VALIDATION_ERROR', 'One or more fields are invalid.', result.errors);
		if (result.status !== 'updated') return failure(404, 'NOT_FOUND', 'Not found.');
		return success(employeeOutput(result.item, undefined, actor.permissionOperations.includes('teams.read')));
	} catch (error) {
		if (isHttpError(error)) throw error;
		return employeeConflictResponse(error) ?? failure(400, 'INVALID_REQUEST', 'Invalid request.');
	}
}

export async function DELETE({ params, locals }: import('./$types').RequestEvent) {
	const { actor, branchId: writerBranchId } = requireScopedOperationApi(locals.user, permissionOperations.employeeManagement); const id = parseId(params.id);
	if (!id) return failure(404, 'NOT_FOUND', 'Not found.');
	try {
	const result = await getPrisma().$transaction(async (tx) => {
		if (!await tx.employee.count({ where: { id, deletedAt: null, ...(writerBranchId === null ? {} : { branchId: writerBranchId }) } })) return 'not_found';
		await lockSystemAdministrators(tx);
		await tx.$queryRaw`SELECT id FROM employees WHERE id = ${id} FOR UPDATE`;
			await protectSystemAdministrator(tx, actor, id);
		await preserveSystemAdministrator(tx, id);
		await ensureAssetsReturned(tx,id);
		await deleteEmployeeRecord(tx,id,actor.id);return 'deleted';
	}, { isolationLevel: 'Serializable' });
	return result === 'deleted' ? success({ id, deleted: true }) : failure(404, 'NOT_FOUND', 'Not found.');
	} catch (error) {
		if (isHttpError(error)) throw error;
		const conflict = employeeConflictResponse(error);
		if (conflict) return conflict;
		throw error;
	}
}
