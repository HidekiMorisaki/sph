import { requireOperationApi } from '$lib/server/api/admin';
import { permissionOperations } from '$lib/server/auth/permissions';
import { bodyObject, contractInput, contractMetrics, recordSoftwareChange } from '$lib/server/api/software';
import { listMeta, parseListQuery } from '$lib/server/api/query';
import { failure, success } from '$lib/server/api/response';
import { getPrisma } from '$lib/server/prisma';

export async function GET({ locals, url }: import('./$types').RequestEvent) {
	requireOperationApi(locals.user, permissionOperations.softwareRead);
	const query = parseListQuery(url, ['reference', 'startsOn', 'renewsOn', 'createdAt'] as const, 'reference');
	const search = url.searchParams.get('q')?.trim() ?? '';
	if (search.length > 255) return failure(422, 'INVALID_SEARCH', 'Search is too long.');
	const where = { deletedAt: null, product: { deletedAt: null }, ...(search ? { OR: [{ reference: { contains: search, mode: 'insensitive' as const } }, { product: { name: { contains: search, mode: 'insensitive' as const } } }] } : {}) };
	const [items, total] = await Promise.all([
		getPrisma().softwareContract.findMany({ where, orderBy: [{ [query.sortBy]: query.sortOrder }, { id: 'asc' }], skip: query.offset, take: query.limit, include: { product: { select: { id: true, name: true, manufacturer: true, edition: true, version: true } }, terms: true, assignments: { where: { deletedAt: null, releasedOn: null }, select: { employeeId: true, assetId: true, releasedOn: true, employee: { select: { deletedAt: true, retiredAt: true } }, asset: { select: { deletedAt: true } } } }, installations: { where: { deletedAt: null, removedOn: null }, select: { assetId: true, asset: { select: { deletedAt: true } }, users: { where: { deletedAt: null, endedOn: null }, select: { employeeId: true, employee: { select: { deletedAt: true, retiredAt: true } } } } } } } }),
		getPrisma().softwareContract.count({ where })
	]);
	return success(items.map(({ assignments, installations, ...item }) => ({ ...item, metrics: contractMetrics({ ...item, assignments, installations }) })), 200, listMeta(query, items.length, total));
}

export async function POST({ locals, request }: import('./$types').RequestEvent) {
	const actor = requireOperationApi(locals.user, permissionOperations.softwareManage);
	const { contract, terms } = contractInput(bodyObject(await request.json().catch(() => null)));
	try {
		const result = await getPrisma().$transaction(async tx => {
			await tx.$queryRaw`SELECT id FROM software_products WHERE id = ${contract.productId} AND deleted_at IS NULL FOR UPDATE`;
			if (!await tx.softwareProduct.count({ where: { id: contract.productId, deletedAt: null } })) return null;
			const item = await tx.softwareContract.create({ data: { ...contract, terms: { create: terms } }, include: { terms: true } });
			await recordSoftwareChange(tx, actor.id, 'software_contract', item.id, 'create', { reference: item.reference, licenseType: item.licenseType, purchasedQuantity: item.purchasedQuantity });
			return item;
		});
		return result ? success(result, 201) : failure(422, 'INVALID_PRODUCT', 'The product is unavailable.');
	} catch (error) {
		if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') return failure(409, 'DUPLICATE_CONTRACT', 'This contract already exists.');
		throw error;
	}
}
