import { branchEditablePermissionCatalog, editablePermissionCatalog, ownBranchOperations } from '$lib/server/auth/permissions';
import { normalizePermissionScopes } from '$lib/server/auth/permission-dependencies';

const allowedCodes = new Set<string>(editablePermissionCatalog.map(({ code }) => code));
const branchAllowedCodes = new Set<string>(branchEditablePermissionCatalog.map(({ code }) => code));
export function editableCodesFrom(permissionCodes: string[], branchAdministrator = false): string[] {
	return permissionCodes.filter((code) => (branchAdministrator ? branchAllowedCodes : allowedCodes).has(code));
}

export type PermissionScope = { code: string; scopeType: 'global' | 'own_branch' };

export function validateEditableRolePermissions(value: unknown, branchAdministrator = false):
	| { success: true; codes: string[]; grants: PermissionScope[] }
	| { success: false; status: 400 | 403; code: string; message: string } {
	if (!Array.isArray(value) || !value.every((entry) => entry && typeof entry === 'object' && !Array.isArray(entry) && Object.keys(entry).sort().join(',') === 'code,scopeType' &&
		typeof entry.code === 'string' && (branchAdministrator ? branchAllowedCodes : allowedCodes).has(entry.code) && (entry.scopeType === 'global' || entry.scopeType === 'own_branch') &&
		(!branchAdministrator || !ownBranchOperations.has(entry.code) || entry.scopeType === 'own_branch') &&
		(entry.scopeType === 'global' || ownBranchOperations.has(entry.code))) || new Set(value.map((entry) => entry.code)).size !== value.length) {
		return { success: false, status: 400, code: 'INVALID_REQUEST', message: 'Invalid permission selection.' };
	}
	const normalized = normalizePermissionScopes(value as PermissionScope[]);
	const grants = new Map(normalized.map(entry => [entry.code, entry.scopeType]));
	return { success: true, codes: [...grants.keys()].sort(), grants: [...grants].map(([code, scopeType]) => ({ code, scopeType })).sort((a, b) => a.code.localeCompare(b.code)) };
}
