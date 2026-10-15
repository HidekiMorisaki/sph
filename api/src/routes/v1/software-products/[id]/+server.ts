import { requireOperationApi } from '$lib/server/api/admin';
import { permissionOperations } from '$lib/server/auth/permissions';
import { parseId } from '$lib/server/api/database';
import { bodyObject, productInput, recordSoftwareChange } from '$lib/server/api/software';
import { failure, success } from '$lib/server/api/response';
import { getPrisma } from '$lib/server/prisma';

export async function GET({ locals, params }: import('./$types').RequestEvent) {
	requireOperationApi(locals.user, permissionOperations.softwareRead);
	const id = parseId(params.id);
	if (!id) return failure(404, 'NOT_FOUND', 'Not found.');
	const item = await getPrisma().softwareProduct.findFirst({ where: { id, deletedAt: null }, select: { id: true, name: true, manufacturer: true, edition: true, version: true, productCode: true, notes: true, createdAt: true } });
	return item ? success(item) : failure(404, 'NOT_FOUND', 'Not found.');
}

export async function PATCH({ locals, params, request }: import('./$types').RequestEvent) {
	const actor = requireOperationApi(locals.user, permissionOperations.softwareManage);
	const id = parseId(params.id);
	if (!id) return failure(404, 'NOT_FOUND', 'Not found.');
	const data = productInput(bodyObject(await request.json().catch(() => null)));
	try {
		const item = await getPrisma().$transaction(async tx => {
			const before = await tx.softwareProduct.findFirst({ where: { id, deletedAt: null } });
			if (!before) return null;
			const updated = await tx.softwareProduct.update({ where: { id }, data });
			await recordSoftwareChange(tx, actor.id, 'software_product', id, 'update', { before: { name: before.name, manufacturer: before.manufacturer, edition: before.edition, version: before.version, productCode: before.productCode, notes: before.notes }, after: data });
			return updated;
		});
		return item ? success(item) : failure(404, 'NOT_FOUND', 'Not found.');
	} catch (error) {
		if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') return failure(409, 'DUPLICATE_PRODUCT', 'This product already exists.');
		throw error;
	}
}

export async function DELETE({ locals, params }: import('./$types').RequestEvent) {
	const actor = requireOperationApi(locals.user, permissionOperations.softwareManage);
	const id = parseId(params.id);
	if (!id) return failure(404, 'NOT_FOUND', 'Not found.');
	const result = await getPrisma().$transaction(async tx => {
		const locked = await tx.$queryRaw<Array<{ id: number }>>`SELECT id FROM software_products WHERE id = ${id} AND deleted_at IS NULL FOR UPDATE`;
		if (!locked.length) return 'not_found';
		if (await tx.softwareContract.count({ where: { productId: id, deletedAt: null } })) return 'in_use';
		const before = await tx.softwareProduct.findUniqueOrThrow({ where: { id }, select: { name: true, manufacturer: true } });
		await tx.softwareProduct.update({ where: { id }, data: { deletedAt: new Date() } });
		await recordSoftwareChange(tx, actor.id, 'software_product', id, 'delete', { before, after: null });
		return 'deleted';
	});
	return result === 'in_use' ? failure(409, 'RESOURCE_IN_USE', 'The product has active contracts.') : result === 'not_found' ? failure(404, 'NOT_FOUND', 'Not found.') : success({ id, deleted: true });
}
