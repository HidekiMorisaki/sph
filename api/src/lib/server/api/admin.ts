import type { Prisma } from '$lib/server/generated/prisma/client';
import type { AuthenticatedUser } from '$lib/server/auth/types';
import { hasPermissionOperation, permissionOperations } from '$lib/server/auth/permissions';
import { throwApiError } from '$lib/server/api/response';

export function requireAdminApi(user: AuthenticatedUser | null): AuthenticatedUser {
	if (!user) throwApiError(401, 'AUTHENTICATION_REQUIRED', 'Authentication is required.');
	if (!hasPermissionOperation(user, permissionOperations.employeeManagement)) throwApiError(403, 'ADMIN_REQUIRED', 'Administrator access is required.');
	return user;
}

export function requireOperationApi(user: AuthenticatedUser | null, operation: string): AuthenticatedUser {
	if (!user) throwApiError(401, 'AUTHENTICATION_REQUIRED', 'Authentication is required.');
	if (!hasPermissionOperation(user, operation)) throwApiError(403, 'PERMISSION_REQUIRED', 'Permission is required.');
	return user;
}

export function requireBranchManagementApi(user: AuthenticatedUser | null): AuthenticatedUser {
	const actor = requireSystemAdminApi(user);
	return requireOperationApi(actor, permissionOperations.branchManagement);
}

export function requireMasterManagementApi(user: AuthenticatedUser | null): AuthenticatedUser {
	return requireOperationApi(user, permissionOperations.masterManagement);
}

export function requireSystemAdminApi(user: AuthenticatedUser | null): AuthenticatedUser {
	if (!user) throwApiError(401, 'AUTHENTICATION_REQUIRED', 'Authentication is required.');
	if (!hasPermissionOperation(user, permissionOperations.systemManagement)) throwApiError(403, 'SYSTEM_ADMIN_REQUIRED', 'System administrator access is required.');
	return user;
}

export function requireAssetWriteApi(user: AuthenticatedUser | null): AuthenticatedUser {
	if (!user) throwApiError(401, 'AUTHENTICATION_REQUIRED', 'Authentication is required.');
	if (!hasPermissionOperation(user, permissionOperations.assetManagement)) throwApiError(403, 'ASSET_WRITE_REQUIRED', 'Asset management access is required.');
	return user;
}

export function requireAssetCredentialReadApi(user: AuthenticatedUser | null): AuthenticatedUser {
	if (!user) throwApiError(401, 'AUTHENTICATION_REQUIRED', 'Authentication is required.');
	if (!hasPermissionOperation(user, permissionOperations.assetCredentialRead)) throwApiError(403, 'ASSET_CREDENTIAL_READ_REQUIRED', 'Asset credential access is required.');
	return user;
}

export function requireAssetCredentialWriteApi(user: AuthenticatedUser | null): AuthenticatedUser {
	if (!user) throwApiError(401, 'AUTHENTICATION_REQUIRED', 'Authentication is required.');
	if (!hasPermissionOperation(user, permissionOperations.assetCredentialWrite)) throwApiError(403, 'ASSET_CREDENTIAL_WRITE_REQUIRED', 'Asset credential management access is required.');
	return user;
}

export function requireAuthenticatedApi(user: AuthenticatedUser | null): AuthenticatedUser {
	if (!user) throwApiError(401, 'AUTHENTICATION_REQUIRED', 'Authentication is required.');
	return user;
}

type AuditWriter = {
	auditLog: { create(args: Prisma.AuditLogCreateArgs): Promise<unknown> };
};

export async function writeAuditLog(client: AuditWriter, actorId: number, action: string, resource: string, resourceId: number, detail?: Prisma.InputJsonValue): Promise<void> {
	await client.auditLog.create({ data: { actorId, action, resource, resourceId, ...(detail === undefined ? {} : { detail }) } });
}
