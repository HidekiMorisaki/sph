import { dev } from '$app/environment';
import { requireAssetCredentialReadApi, writeAuditLog } from '$lib/server/api/admin';
import { decryptPassword, isAssetCredentialType } from '$lib/server/api/it-asset-credentials';
import { parseId } from '$lib/server/api/database';
import { failure, success } from '$lib/server/api/response';
import { allowsSensitiveRequest } from '$lib/server/api/sensitive-transport';
import { verifyPassword } from '$lib/server/auth/session';
import { getPrisma } from '$lib/server/prisma';

function reauthenticationFailed() {
	return failure(401, 'REAUTHENTICATION_FAILED', 'The current password could not be verified.');
}

export async function POST({ params, locals, request, url }: import('./$types').RequestEvent) {
	const actor = requireAssetCredentialReadApi(locals.user);
	if (!dev && !allowsSensitiveRequest(url, request) && request.headers.get('x-forwarded-proto') !== 'https') return failure(403, 'HTTPS_REQUIRED', 'Asset credentials require HTTPS.');
	const assetId = parseId(params.id);
	if (!assetId) return failure(404, 'NOT_FOUND', 'Not found.');
	const body = await request.json().catch(() => null) as Record<string, unknown> | null;
	const type = typeof body?.credentialType === 'string' && isAssetCredentialType(body.credentialType) ? body.credentialType : null;
	const currentPassword = body?.currentPassword;
	if (!type || typeof currentPassword !== 'string' || currentPassword.length > 1024) return reauthenticationFailed();
	const prisma = getPrisma();
	const employee = await prisma.employee.findFirst({ where: { id: actor.id, deletedAt: null, accountStatus: 'active' }, select: { passwordHash: true } });
	if (!employee?.passwordHash || !(await verifyPassword(currentPassword, employee.passwordHash))) return reauthenticationFailed();
	const result = await prisma.$transaction(async tx => {
		if (!await tx.itAsset.count({ where: { id: assetId, deletedAt: null } })) return null;
		const credential = await tx.itAssetCredential.findFirst({ where: { assetId, credentialType: type, deletedAt: null } });
		if (!credential) return { configured: false as const };
		const password = decryptPassword(credential);
		await writeAuditLog(tx, actor.id, 'reveal_credential', 'it_asset', assetId, { credentialType: type });
		return { configured: true as const, password };
	});
	if (result === null) return failure(404, 'NOT_FOUND', 'Not found.');
	if (!result.configured) return failure(404, 'CREDENTIAL_NOT_FOUND', 'The asset credential is not configured.');
	const response = success({ credentialType: type, password: result.password });
	response.headers.set('cache-control', 'no-store');
	response.headers.set('pragma', 'no-cache');
	return response;
}
