import { dev } from '$app/environment';
import { requireOperationApi } from '$lib/server/api/admin';
import { permissionOperations } from '$lib/server/auth/permissions';
import { parseId } from '$lib/server/api/database';
import { bodyObject, dateInput, encryptLicenseKey, fieldsOnly, optionalText, positiveInteger, publicKey, recordSoftwareChange } from '$lib/server/api/software';
import { failure, success } from '$lib/server/api/response';
import { getPrisma } from '$lib/server/prisma';
import { allowsSensitiveRequest } from '$lib/server/api/sensitive-transport';

export async function PUT({ locals, params, request, url }: import('./$types').RequestEvent) {
	const actor = requireOperationApi(locals.user, permissionOperations.softwareKeyWrite);
	if (!dev && !allowsSensitiveRequest(url, request) && request.headers.get('x-forwarded-proto') !== 'https') return failure(403, 'HTTPS_REQUIRED', 'Secure transport is required.');
	const contractId = parseId(params.id);
	const keyId = parseId(params.keyId);
	if (!contractId || !keyId) return failure(404, 'NOT_FOUND', 'Not found.');
	const body = bodyObject(await request.json().catch(() => null));
	fieldsOnly(body, ['key', 'label', 'activationLimit', 'expiresOn', 'notes']);
	if (body.key !== undefined && (typeof body.key !== 'string' || body.key.length < 4 || body.key.length > 2048 || !body.key.trim())) return failure(422, 'INVALID_KEY', 'Enter a key between 4 and 2048 characters.');
	const metadata = { label: optionalText(body.label, 'label', 255), activationLimit: positiveInteger(body.activationLimit, 'activationLimit', true), expiresOn: dateInput(body.expiresOn, 'expiresOn', true), notes: optionalText(body.notes, 'notes', 5000) };
	try {
		const item = await getPrisma().$transaction(async tx => {
			const before = await tx.softwareLicenseKey.findFirst({ where: { id: keyId, contractId, deletedAt: null, contract: { deletedAt: null } } });
			if (!before) return null;
			const updated = await tx.softwareLicenseKey.update({ where: { id: keyId }, data: { ...metadata, ...(body.key === undefined ? {} : encryptLicenseKey(contractId, body.key as string)) } });
			await recordSoftwareChange(tx, actor.id, 'software_key', keyId, 'update', { before: { label: before.label, lastFour: before.lastFour, activationLimit: before.activationLimit, expiresOn: before.expiresOn?.toISOString().slice(0, 10) }, after: { label: updated.label, lastFour: updated.lastFour, activationLimit: updated.activationLimit, expiresOn: updated.expiresOn?.toISOString().slice(0, 10) } });
			await recordSoftwareChange(tx, actor.id, 'software_contract', contractId, 'update_key', { keyId, label: updated.label, lastFour: updated.lastFour });
			return publicKey(updated);
		});
		const response = item ? success(item) : failure(404, 'NOT_FOUND', 'Not found.');
		response.headers.set('cache-control', 'no-store');
		return response;
	} catch (error) {
		if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') return failure(409, 'DUPLICATE_KEY', 'This key is already registered for the contract.');
		throw error;
	}
}
