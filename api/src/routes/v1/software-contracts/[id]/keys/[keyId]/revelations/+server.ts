import { dev } from '$app/environment';
import { requireOperationApi, writeAuditLog } from '$lib/server/api/admin';
import { permissionOperations } from '$lib/server/auth/permissions';
import { parseId } from '$lib/server/api/database';
import { bodyObject, decryptLicenseKey, fieldsOnly } from '$lib/server/api/software';
import { allowsSensitiveRequest } from '$lib/server/api/sensitive-transport';
import { verifyPassword } from '$lib/server/auth/session';
import { failure, success } from '$lib/server/api/response';
import { getPrisma } from '$lib/server/prisma';

export async function POST({ locals, params, request, url }: import('./$types').RequestEvent) {
	const actor = requireOperationApi(locals.user, permissionOperations.softwareKeyRead);
	if (!dev && !allowsSensitiveRequest(url, request) && request.headers.get('x-forwarded-proto') !== 'https') return failure(403, 'HTTPS_REQUIRED', 'Secure transport is required.');
	const contractId = parseId(params.id);
	const keyId = parseId(params.keyId);
	if (!contractId || !keyId) return failure(404, 'NOT_FOUND', 'Not found.');
	const body = bodyObject(await request.json().catch(() => null));
	fieldsOnly(body, ['currentPassword']);
	if (typeof body.currentPassword !== 'string' || body.currentPassword.length > 1024) return failure(401, 'REAUTHENTICATION_FAILED', 'The current password could not be verified.');
	const employee = await getPrisma().employee.findFirst({ where: { id: actor.id, deletedAt: null, accountStatus: 'active' }, select: { passwordHash: true } });
	if (!employee?.passwordHash || !(await verifyPassword(body.currentPassword, employee.passwordHash))) return failure(401, 'REAUTHENTICATION_FAILED', 'The current password could not be verified.');
	const result = await getPrisma().$transaction(async tx => {
		const key = await tx.softwareLicenseKey.findFirst({ where: { id: keyId, contractId, deletedAt: null, contract: { deletedAt: null, product: { deletedAt: null } } } });
		if (!key) return null;
		const plaintext = decryptLicenseKey(key);
		await writeAuditLog(tx, actor.id, 'reveal_key', 'software_key', keyId, { contractId });
		return plaintext;
	});
	const response = result === null ? failure(404, 'NOT_FOUND', 'Not found.') : success({ key: result });
	response.headers.set('cache-control', 'no-store');
	response.headers.set('pragma', 'no-cache');
	return response;
}
