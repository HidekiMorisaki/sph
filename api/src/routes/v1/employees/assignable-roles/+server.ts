import { requireUser } from '$lib/server/auth/session';
import { hasPermissionOperation, permissionOperations } from '$lib/server/auth/permissions';
import { failure, success } from '$lib/server/api/response';
import { getPrisma } from '$lib/server/prisma';

export async function GET({ locals }: import('./$types').RequestEvent) {
	const user = requireUser(locals.user);
	if (!hasPermissionOperation(user, permissionOperations.employeeManagement) && !user.ownBranchPermissionOperations.includes(permissionOperations.employeeManagement)) {
		return failure(403, 'PERMISSION_REQUIRED', 'Permission is required.');
	}
	const canAssign = hasPermissionOperation(user, permissionOperations.systemManagement) && user.permissionOperations.includes('roles.assign');
	const roles = await getPrisma().role.findMany({
		where: { deletedAt: null, ...(canAssign ? {} : { defaultKey: 'general_user' }) },
		select: { id: true, name: true, defaultKey: true },
		orderBy: [{ name: 'asc' }, { id: 'asc' }]
	});
	return success(roles.map(({ id, name, defaultKey }) => ({ id, name, isGeneralUser: defaultKey === 'general_user', isSystemManagement: defaultKey === 'system_administrator', isBranchAdministrator: defaultKey === 'branch_administrator' })));
}
