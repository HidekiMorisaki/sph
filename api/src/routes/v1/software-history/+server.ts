import { requireOperationApi } from '$lib/server/api/admin';
import { permissionOperations } from '$lib/server/auth/permissions';
import { parseId } from '$lib/server/api/database';
import { listMeta, parseListQuery } from '$lib/server/api/query';
import { failure, success } from '$lib/server/api/response';
import { getPrisma } from '$lib/server/prisma';

export async function GET({ locals, url }: import('./$types').RequestEvent) {
	requireOperationApi(locals.user, permissionOperations.softwareRead);
	const resource = url.searchParams.get('resource');
	const resourceId = parseId(url.searchParams.get('resourceId') ?? '');
	if (!resourceId || (resource !== 'software_product' && resource !== 'software_contract')) return failure(422, 'INVALID_RESOURCE', 'Select a product or contract.');
	const exists = resource === 'software_product' ? await getPrisma().softwareProduct.count({ where: { id: resourceId, deletedAt: null } }) : await getPrisma().softwareContract.count({ where: { id: resourceId, deletedAt: null } });
	if (!exists) return failure(404, 'NOT_FOUND', 'Not found.');
	const query = parseListQuery(url, ['changedAt'] as const, 'changedAt');
	const where = { resource, resourceId, deletedAt: null };
	const [items, total] = await Promise.all([
		getPrisma().softwareChangeHistory.findMany({ where, orderBy: [{ changedAt: query.sortOrder }, { id: 'desc' }], skip: query.offset, take: query.limit, select: { id: true, action: true, changes: true, changedAt: true, actor: { select: { id: true, firstName: true, middleName: true, lastName: true } } } }),
		getPrisma().softwareChangeHistory.count({ where })
	]);
	return success(items, 200, listMeta(query, items.length, total));
}
