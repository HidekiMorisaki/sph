import type { Prisma } from '$lib/server/generated/prisma/client';
import type { AuthenticatedUser } from '$lib/server/auth/types';
import { throwApiError } from '$lib/server/api/response';

export function requireAdminApi(user: AuthenticatedUser | null): AuthenticatedUser {
	if (!user) throwApiError(401, 'AUTHENTICATION_REQUIRED', 'Authentication is required.');
	if (!user.roles.some((role) => role === 'system_administrator' || role === 'business_administrator')) throwApiError(403, 'ADMIN_REQUIRED', 'Administrator access is required.');
	return user;
}

export function requireSystemAdminApi(user: AuthenticatedUser | null): AuthenticatedUser {
	if (!user) throwApiError(401, 'AUTHENTICATION_REQUIRED', 'Authentication is required.');
	if (!user.roles.includes('system_administrator')) throwApiError(403, 'SYSTEM_ADMIN_REQUIRED', 'System administrator access is required.');
	return user;
}

export function requireAssetWriteApi(user: AuthenticatedUser | null): AuthenticatedUser {
	if (!user) throwApiError(401, 'AUTHENTICATION_REQUIRED', 'Authentication is required.');
	if (!user.roles.some((role) => role === 'system_administrator' || role === 'business_administrator' || role === 'general_user')) throwApiError(403, 'ASSET_WRITE_REQUIRED', 'Asset management access is required.');
	return user;
}

export function requireAuthenticatedApi(user: AuthenticatedUser | null): AuthenticatedUser {
	if (!user) throwApiError(401, 'AUTHENTICATION_REQUIRED', 'Authentication is required.');
	return user;
}

type AuditWriter = {
	auditLog: { create(args: Prisma.AuditLogCreateArgs): Promise<unknown> };
};

export async function writeAuditLog(client: AuditWriter, actorId: number, action: string, resource: string, resourceId: number): Promise<void> {
	await client.auditLog.create({ data: { actorId, action, resource, resourceId } });
}
