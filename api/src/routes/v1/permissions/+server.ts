import { permissionDependencies, derivedPermissionCodes } from '#lib/server/auth/permission-dependencies.js';
import { requireSystemAdminApi } from '#lib/server/api/admin.js';
import { branchEditablePermissionCatalog, editablePermissionCatalog, ownBranchOperations } from '#lib/server/auth/permissions.js';
import { success } from '#lib/server/api/response.js';

export function GET({ locals }: import('./$types').RequestEvent) {
	requireSystemAdminApi(locals.user);
	const response = success({
		permissions: [...editablePermissionCatalog, ...branchEditablePermissionCatalog.filter(({ code }) => !editablePermissionCatalog.some(entry => entry.code === code)), ...[...derivedPermissionCodes].map(code => ({ code, category: code.startsWith('books.') ? 'books' : code.startsWith('branches.') ? 'masters' : code.split('.')[0] }))].map((permission) => ({
			...permission,
			branchAdministratorOnly: !editablePermissionCatalog.some(entry => entry.code === permission.code) && !derivedPermissionCodes.has(permission.code),
			branchAdministratorAllowed: branchEditablePermissionCatalog.some(entry => entry.code === permission.code) || derivedPermissionCodes.has(permission.code) && ownBranchOperations.has(permission.code),
			derived: derivedPermissionCodes.has(permission.code),
			dependencies: { global: permissionDependencies(permission.code, 'global'), own_branch: permissionDependencies(permission.code, 'own_branch') },
			systemAdministratorOnly: false,
			allowOwnBranch: ownBranchOperations.has(permission.code)
		}))
	});
	response.headers.set('Cache-Control', 'no-store');
	return response;
}
