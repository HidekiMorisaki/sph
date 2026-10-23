import { permissionDependencies, derivedPermissionCodes } from '$lib/server/auth/permission-dependencies';
import { requireSystemAdminApi } from '$lib/server/api/admin';
import { editablePermissionCatalog, ownBranchOperations } from '$lib/server/auth/permissions';
import { success } from '$lib/server/api/response';

export function GET({ locals }: import('./$types').RequestEvent) {
	requireSystemAdminApi(locals.user);
	const response = success({
		permissions: [...editablePermissionCatalog, ...[...derivedPermissionCodes].map(code => ({ code, category: code.startsWith('books.') ? 'books' : code.startsWith('branches.') ? 'masters' : code.split('.')[0] }))].map((permission) => ({
			...permission,
			derived: derivedPermissionCodes.has(permission.code),
			dependencies: { global: permissionDependencies(permission.code, 'global'), own_branch: permissionDependencies(permission.code, 'own_branch') },
			systemAdministratorOnly: false,
			allowOwnBranch: ownBranchOperations.has(permission.code)
		}))
	});
	response.headers.set('Cache-Control', 'no-store');
	return response;
}
