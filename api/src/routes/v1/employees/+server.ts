import { dev } from '$app/environment';
import { isHttpError } from '@sveltejs/kit';
import { syncEmployeeTeams } from '$lib/server/api/teams';
import { writeAuditLog } from '$lib/server/api/admin';
import { requireScopedOperationApi } from '$lib/server/api/branch-access';
import { parseEmployeeInput } from '$lib/server/api/employee-input';
import { employeeConflictResponse } from '$lib/server/api/employee-errors';
import { readEmployeeFields, recordEmployeeChange } from '$lib/server/api/employee-history';
import { employeeOutput, employeeSafeSelect } from '$lib/server/api/employee-output';
import { syncEmployeeDepartments } from '$lib/server/api/employee-departments';
import { syncEmployeePositions } from '$lib/server/api/employee-positions';
import { employeeReferenceErrors } from '$lib/server/api/employee-references';
import { canAssignRequestedRoles, createGlobalRoleGrants } from '$lib/server/api/employee-roles';
import { issueInvitation } from '$lib/server/auth/invitation';
import { hasPermissionOperation, permissionOperations } from '$lib/server/auth/permissions';
import { failure, success } from '$lib/server/api/response';
import { allowsSensitiveRequest } from '$lib/server/api/sensitive-transport';
import { getPrisma } from '$lib/server/prisma';

import { employeeList } from '$lib/server/api/employee-list';

export async function GET({locals,url}: import('./$types').RequestEvent) { return employeeList(locals.user,url); }

export async function POST({ request, locals, url }: import('./$types').RequestEvent) {
	const { actor, branchId: writerBranchId } = requireScopedOperationApi(locals.user, permissionOperations.employeeManagement);
	if (hasPermissionOperation(actor, permissionOperations.systemManagement) && !dev && !allowsSensitiveRequest(url, request)) return failure(403, 'HTTPS_REQUIRED', 'Account invitations require HTTPS.');
	const parsed = parseEmployeeInput(await request.json().catch(() => null));
	if (!parsed.success) return failure(400, 'VALIDATION_ERROR', 'One or more fields are invalid.', parsed.errors);
	const input = parsed.data;
	if (writerBranchId !== null && input.employee.branchId !== writerBranchId) return failure(403, 'BRANCH_ACCESS_DENIED', 'Branch access is required.');
	if (writerBranchId !== null) {
		const baseRole = await getPrisma().role.findFirst({ where: { defaultKey: 'general_user', deletedAt: null }, select: { id: true } });
		if (!baseRole || input.roleIds.length !== 1 || input.roleIds[0] !== baseRole.id) return failure(403, 'ROLE_ASSIGNMENT_FORBIDDEN', 'Only system administrators can assign roles.');
	}
	if (!await canAssignRequestedRoles(actor, input.roleIds)) return failure(403, 'ROLE_ASSIGNMENT_FORBIDDEN', 'You cannot assign one or more requested roles.');
	try {
		const result = await getPrisma().$transaction(async (tx) => {
			const referenceErrors = await employeeReferenceErrors(tx, { ...input.employee, departmentIds: input.departmentIds, primaryDepartmentId: input.primaryDepartmentId, positionIds: input.positionIds });
			if (referenceErrors.length) return { status: 'invalid_reference' as const, errors: referenceErrors };
			const created = await tx.employee.create({ data: input.employee, select: { id: true } });
			await syncEmployeeTeams(tx, actor, created.id, input.teamIds);
			await syncEmployeeDepartments(tx, created.id, input.departmentIds, input.primaryDepartmentId);
			await syncEmployeePositions(tx, created.id, input.positionIds, input.primaryPositionId);
			if (!await createGlobalRoleGrants(tx, created.id, input.roleIds)) throw new Error('role unavailable');
			const invitation = hasPermissionOperation(actor, permissionOperations.systemManagement) ? await issueInvitation(tx, created.id, actor.id, input.employee.email) : null;
			await recordEmployeeChange(tx, created.id, actor.id, 'create', null, await readEmployeeFields(tx, created.id));
			await writeAuditLog(tx, actor.id, 'create', 'employee', created.id);
			await writeAuditLog(tx, actor.id, 'update_roles', 'employee', created.id);
			return { status: 'created' as const, item: await tx.employee.findUniqueOrThrow({ where: { id: created.id }, select: employeeSafeSelect }), invitation };
		}, { isolationLevel: 'Serializable' });
		if (result.status !== 'created') return failure(400, 'VALIDATION_ERROR', 'One or more fields are invalid.', result.errors);
		const response = success({ ...employeeOutput(result.item, undefined, actor.permissionOperations.includes('teams.read')), ...(result.invitation ?? {}) }, 201);
		response.headers.set('Cache-Control', 'no-store');
		return response;
	} catch (error) {
		if (isHttpError(error)) throw error;
		return employeeConflictResponse(error) ?? failure(400, 'INVALID_REQUEST', 'Invalid request.');
	}
}
