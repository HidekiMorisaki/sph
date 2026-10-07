import { requireSystemAdminApi } from '$lib/server/api/admin';
import { editablePermissionCatalog, permissionOperations } from '$lib/server/auth/permissions';
import { success } from '$lib/server/api/response';

export function GET({ locals }: import('./$types').RequestEvent) {
	requireSystemAdminApi(locals.user);
	const response = success({
		permissions: editablePermissionCatalog.map((permission) => ({
			...permission,
			systemAdministratorOnly: permission.code === permissionOperations.branchManagement || permission.code === permissionOperations.calendarAssignment
		}))
	});
	response.headers.set('Cache-Control', 'no-store');
	return response;
}
