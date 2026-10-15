import { dev } from '$app/environment';
import { requireOperationApi } from '$lib/server/api/admin';
import { permissionOperations } from '$lib/server/auth/permissions';
import { parseId } from '$lib/server/api/database';
import { bodyObject, dateInput, encryptLicenseKey, fieldsOnly, optionalText, positiveInteger, publicKey, recordSoftwareChange } from '$lib/server/api/software';
import { listMeta, parseListQuery } from '$lib/server/api/query';
import { failure, success } from '$lib/server/api/response';
import { getPrisma } from '$lib/server/prisma';
import { allowsSensitiveRequest } from '$lib/server/api/sensitive-transport';

export async function GET({ locals, params, url }: import('./$types').RequestEvent) {
	requireOperationApi(locals.user, permissionOperations.softwareRead);
	const id = parseId(params.id);
	if (!id || !await getPrisma().softwareContract.count({ where: { id, deletedAt: null, product: { deletedAt: null } } })) return failure(404, 'NOT_FOUND', 'Not found.');
	const query = parseListQuery(url, ['createdAt', 'label', 'expiresOn'] as const, 'createdAt');
	const where = { contractId: id, deletedAt: null };
	const [items, total] = await Promise.all([
		getPrisma().softwareLicenseKey.findMany({ where, orderBy: [{ [query.sortBy]: query.sortOrder }, { id: 'asc' }], skip: query.offset, take: query.limit, select: { id: true, contractId: true, label: true, lastFour: true, activationLimit: true, expiresOn: true, notes: true } }),
		getPrisma().softwareLicenseKey.count({ where })
	]);
	return success(items.map(publicKey), 200, listMeta(query, items.length, total));
}

export async function POST({ locals, params, request, url }: import('./$types').RequestEvent) {
	const actor = requireOperationApi(locals.user, permissionOperations.softwareKeyWrite);
	if (!dev && !allowsSensitiveRequest(url, request) && request.headers.get('x-forwarded-proto') !== 'https') return failure(403, 'HTTPS_REQUIRED', 'Secure transport is required.');
	const id = parseId(params.id);
	if (!id) return failure(404, 'NOT_FOUND', 'Not found.');
	const body = bodyObject(await request.json().catch(() => null));
	fieldsOnly(body, ['key', 'label', 'activationLimit', 'expiresOn', 'notes']);
	if (typeof body.key !== 'string' || body.key.length < 4 || body.key.length > 2048 || !body.key.trim()) return failure(422, 'INVALID_KEY', 'Enter a key between 4 and 2048 characters.');
	const metadata = { label: optionalText(body.label, 'label', 255), activationLimit: positiveInteger(body.activationLimit, 'activationLimit', true), expiresOn: dateInput(body.expiresOn, 'expiresOn', true), notes: optionalText(body.notes, 'notes', 5000) };
	try {
		const result = await getPrisma().$transaction(async tx => {
			if (!await tx.softwareContract.count({ where: { id, deletedAt: null, product: { deletedAt: null } } })) return null;
			const item = await tx.softwareLicenseKey.create({ data: { contractId: id, ...metadata, ...encryptLicenseKey(id, body.key as string) } });
			await recordSoftwareChange(tx, actor.id, 'software_key', item.id, 'create', { contractId: id, label: item.label, lastFour: item.lastFour });
			await recordSoftwareChange(tx, actor.id, 'software_contract', id, 'add_key', { keyId: item.id, label: item.label, lastFour: item.lastFour });
			return publicKey(item);
		});
		const response = result ? success(result, 201) : failure(404, 'NOT_FOUND', 'Not found.');
		response.headers.set('cache-control', 'no-store');
		return response;
	} catch (error) {
		if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') return failure(409, 'DUPLICATE_KEY', 'This key is already registered for the contract.');
		throw error;
	}
}
