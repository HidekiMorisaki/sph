import { requireOperationApi } from '$lib/server/api/admin';
import { permissionOperations } from '$lib/server/auth/permissions';
import { contractMetrics } from '$lib/server/api/software';
import { listMeta, parseListQuery } from '$lib/server/api/query';
import { success } from '$lib/server/api/response';
import { getPrisma } from '$lib/server/prisma';

export async function GET({ locals, url }: import('./$types').RequestEvent) {
	requireOperationApi(locals.user, permissionOperations.softwareRead);
	const query = parseListQuery(url, ['renewsOn', 'endsOn'] as const, 'renewsOn');
	const now = new Date();
	const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
	const cutoff = new Date(today.getTime() + 30 * 86400000);
	const where = { deletedAt: null, product: { deletedAt: null }, OR: [{ renewsOn: { lte: cutoff } }, { renewsOn: null, endsOn: { lte: cutoff } }] };
	const [items, total] = await Promise.all([
		getPrisma().softwareContract.findMany({ where, orderBy: [{ [query.sortBy]: query.sortOrder }, { id: 'asc' }], skip: query.offset, take: query.limit, include: { product: { select: { id: true, name: true, manufacturer: true, edition: true, version: true } }, terms: true, assignments: { where: { deletedAt: null, releasedOn: null }, select: { employeeId: true, assetId: true, releasedOn: true, employee: { select: { deletedAt: true, retiredAt: true } }, asset: { select: { deletedAt: true } } } }, installations: { where: { deletedAt: null, removedOn: null }, select: { assetId: true, asset: { select: { deletedAt: true } }, users: { where: { deletedAt: null, endedOn: null }, select: { employeeId: true, employee: { select: { deletedAt: true, retiredAt: true } } } } } } } }),
		getPrisma().softwareContract.count({ where })
	]);
	return success(items.map(({ assignments, installations, ...item }) => ({ ...item, metrics: contractMetrics({ ...item, assignments, installations }) })), 200, listMeta(query, items.length, total));
}
