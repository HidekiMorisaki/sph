import { editablePermissionCatalog, ownBranchOperations, permissionOperations } from '$lib/server/auth/permissions';
import granularOperations from '$lib/server/auth/granular-operations.json';

const allowedCodes = new Set<string>(editablePermissionCatalog.map(({ code }) => code));
const readDependencies: Array<[string, string]> = [
	[permissionOperations.employeeManagement, permissionOperations.employeeRead],
	[permissionOperations.masterManagement, permissionOperations.masterRead],
	[permissionOperations.branchManagement, permissionOperations.masterRead],
	[permissionOperations.calendarAssignment, permissionOperations.calendarRead],
	[permissionOperations.assetManagement, permissionOperations.assetRead],
	[permissionOperations.assetCredentialRead, permissionOperations.assetRead],
	[permissionOperations.assetCredentialWrite, permissionOperations.assetRead]
];

export function editableCodesFrom(permissionCodes: string[]): string[] {
	return permissionCodes.filter((code) => allowedCodes.has(code));
}

export type PermissionScope = { code: string; scopeType: 'global' | 'own_branch' };

export function validateEditableRolePermissions(value: unknown):
	| { success: true; codes: string[]; grants: PermissionScope[] }
	| { success: false; status: 400 | 403; code: string; message: string } {
	if (!Array.isArray(value) || !value.every((entry) => entry && typeof entry === 'object' && !Array.isArray(entry) && Object.keys(entry).sort().join(',') === 'code,scopeType' &&
		typeof entry.code === 'string' && allowedCodes.has(entry.code) && (entry.scopeType === 'global' || entry.scopeType === 'own_branch') &&
		(entry.scopeType === 'global' || ownBranchOperations.has(entry.code))) || new Set(value.map((entry) => entry.code)).size !== value.length) {
		return { success: false, status: 400, code: 'INVALID_REQUEST', message: 'Invalid permission selection.' };
	}
	const selected = value as PermissionScope[];
	const grants = new Map(selected.map((entry) => [entry.code, entry.scopeType]));
	const addPrerequisite = (code: string, scopeType: PermissionScope['scopeType']) => {
		if (grants.get(code) !== 'global') grants.set(code, scopeType === 'global' ? 'global' : grants.get(code) ?? 'own_branch');
	};
	for (const operation of granularOperations) {
		const scopeType = grants.get(operation.code);
		if (!scopeType) continue;
		if (operation.systemOnly) return { success: false, status: 403, code: 'SYSTEM_ROLE_REQUIRED', message: 'This permission requires a system administrator role.' };
		const prerequisites = Array.isArray(operation.prerequisite) ? operation.prerequisite : [operation.prerequisite];
		addPrerequisite(prerequisites.includes(permissionOperations.branchManagement) && (scopeType === 'own_branch' || selected.some(({ code }) => code.startsWith('branches.') || code.startsWith('financial.')))
			? permissionOperations.branchManagement : prerequisites[0], scopeType);
	}
	for (const [operation, prerequisite] of readDependencies) {
		const scopeType = grants.get(operation);
		if (scopeType) addPrerequisite(prerequisite, scopeType);
	}
	return { success: true, codes: [...grants.keys()].sort(), grants: [...grants].map(([code, scopeType]) => ({ code, scopeType })).sort((a, b) => a.code.localeCompare(b.code)) };
}
