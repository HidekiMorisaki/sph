import type { AuthenticatedUser } from '$lib/server/auth/types';
import { hasOwnBranchPermissionOperation, permissionOperations } from '$lib/server/auth/permissions';
import { throwApiError } from '$lib/server/api/response';
import type { Prisma } from '$lib/server/generated/prisma/client';

function combinedBranchScope(user: AuthenticatedUser, operation: string): number | null {
	const scopes = [operation, user.activeOperation].filter((value): value is string => Boolean(value));
	if (scopes.some((code) => !user.permissionOperations.includes(code) && !hasOwnBranchPermissionOperation(user, code))) throwApiError(403, 'PERMISSION_REQUIRED', 'Permission is required.');
	return scopes.every((code) => user.permissionOperations.includes(code)) ? null : user.branchId;
}

/** Null means the operation is granted globally; a number limits it to the employee's current branch. */
export function requiredBranchScope(user: AuthenticatedUser | null, operation: string): number | null {
	if (!user) throwApiError(401, 'AUTHENTICATION_REQUIRED', 'Authentication is required.');
	return combinedBranchScope(user, operation);
}

export function requireScopedOperationApi(user: AuthenticatedUser | null, operation: string): { actor: AuthenticatedUser; branchId: number | null } {
	const branchId = requiredBranchScope(user, operation);
	return { actor: user as AuthenticatedUser, branchId };
}

export function requireBranchAccess(user: AuthenticatedUser | null, operation: string, branchId: number): AuthenticatedUser {
	if (!user) throwApiError(401, 'AUTHENTICATION_REQUIRED', 'Authentication is required.');
	if (combinedBranchScope(user, operation) !== null && user.branchId !== branchId) throwApiError(403, 'BRANCH_ACCESS_DENIED', 'Branch access is required.');
	return user;
}

export function requireLocationManagementApi(user: AuthenticatedUser | null): { actor: AuthenticatedUser; branchId: number | null } {
	if (!user) throwApiError(401, 'AUTHENTICATION_REQUIRED', 'Authentication is required.');
	if (user.permissionOperations.includes(permissionOperations.masterManagement)) return { actor: user, branchId: combinedBranchScope(user, permissionOperations.masterManagement) };
	if (hasOwnBranchPermissionOperation(user, permissionOperations.branchManagement)) return { actor: user, branchId: combinedBranchScope(user, permissionOperations.branchManagement) };
	throwApiError(403, 'PERMISSION_REQUIRED', 'Permission is required.');
}

export function referenceBranchScope(user: AuthenticatedUser | null): number | null {
	if (!user) throwApiError(401, 'AUTHENTICATION_REQUIRED', 'Authentication is required.');
	if (user.permissionOperations.includes(permissionOperations.masterRead)) return null;
	if (hasOwnBranchPermissionOperation(user, permissionOperations.masterRead)) return user.branchId;
	throwApiError(403, 'PERMISSION_REQUIRED', 'Permission is required.');
}

export function assetBranchWhere(branchId: number | null): Prisma.ItAssetWhereInput {
	return branchId === null ? {} : { storage: { branchId } };
}
