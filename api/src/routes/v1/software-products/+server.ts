import { requireOperationApi } from '$lib/server/api/admin';
import { permissionOperations } from '$lib/server/auth/permissions';
import { bodyObject, productInput, recordSoftwareChange } from '$lib/server/api/software';
import { listMeta, parseListQuery } from '$lib/server/api/query';
import { failure, success } from '$lib/server/api/response';
import { getPrisma } from '$lib/server/prisma';

export async function GET({ locals, url }: import('./$types').RequestEvent) {
	requireOperationApi(locals.user, permissionOperations.softwareRead);
	const query = parseListQuery(url, ['name', 'manufacturer', 'createdAt'] as const, 'name');
	const search = url.searchParams.get('q')?.trim() ?? '';
	if (search.length > 255) return failure(422, 'INVALID_SEARCH', 'Search is too long.');
	const where = { deletedAt: null, ...(search ? { OR: [{ name: { contains: search, mode: 'insensitive' as const } }, { manufacturer: { contains: search, mode: 'insensitive' as const } }] } : {}) };
	const [items, total] = await Promise.all([
		getPrisma().softwareProduct.findMany({ where, orderBy: [{ [query.sortBy]: query.sortOrder }, { id: 'asc' }], skip: query.offset, take: query.limit, select: { id: true, name: true, manufacturer: true, edition: true, version: true, productCode: true, notes: true, createdAt: true } }),
		getPrisma().softwareProduct.count({ where })
	]);
	return success(items, 200, listMeta(query, items.length, total));
}

export async function POST({ locals, request }: import('./$types').RequestEvent) {
	const actor = requireOperationApi(locals.user, permissionOperations.softwareManage);
	const data = productInput(bodyObject(await request.json().catch(() => null)));
	try {
		const item = await getPrisma().$transaction(async tx => {
			const created = await tx.softwareProduct.create({ data });
			await recordSoftwareChange(tx, actor.id, 'software_product', created.id, 'create', { name: created.name, manufacturer: created.manufacturer });
			return created;
		});
		return success(item, 201);
	} catch (error) {
		if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') return failure(409, 'DUPLICATE_PRODUCT', 'This product already exists.');
		throw error;
	}
}
