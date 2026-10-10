import { requireSystemAdminApi } from '$lib/server/api/admin';
import { editablePermissionCatalog, ownBranchOperations } from '$lib/server/auth/permissions';
import { success } from '$lib/server/api/response';

export function GET({ locals }: import('./$types').RequestEvent) {
	requireSystemAdminApi(locals.user);
	const response = success({
		permissions: editablePermissionCatalog.map((permission) => ({
			...permission,
			systemAdministratorOnly: false,
			allowOwnBranch: ownBranchOperations.has(permission.code)
		}))
	});
	response.headers.set('Cache-Control', 'no-store');
	return response;
}
