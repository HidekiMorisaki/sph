import { requireOperationApi } from '$lib/server/api/admin';
import { permissionOperations } from '$lib/server/auth/permissions';
import { listMeta, parseListQuery } from '$lib/server/api/query';
import { failure, success } from '$lib/server/api/response';
import { getPrisma } from '$lib/server/prisma';

export async function GET({ locals, url }: import('./$types').RequestEvent) {
	requireOperationApi(locals.user, permissionOperations.softwareManage);
	const kind = url.searchParams.get('kind');
	if (kind !== 'employee' && kind !== 'asset') return failure(422, 'INVALID_KIND', 'Select employee or asset.');
	const query = parseListQuery(url, kind === 'employee' ? ['employeeCode'] as const : ['assetTag'] as const, kind === 'employee' ? 'employeeCode' : 'assetTag');
	const search = url.searchParams.get('q')?.trim() ?? '';
	if (search.length > 255) return failure(422, 'INVALID_SEARCH', 'Search is too long.');
	if (kind === 'employee') {
		const where = { deletedAt: null, OR: [{ retiredAt: null }, { retiredAt: { gt: new Date() } }], ...(search ? { AND: [{ OR: [{ employeeCode: { contains: search, mode: 'insensitive' as const } }, { firstName: { contains: search, mode: 'insensitive' as const } }, { lastName: { contains: search, mode: 'insensitive' as const } }] }] } : {}) };
		const [items, total] = await Promise.all([getPrisma().employee.findMany({ where, orderBy: [{ employeeCode: query.sortOrder }, { id: 'asc' }], skip: query.offset, take: query.limit, select: { id: true, employeeCode: true, firstName: true, middleName: true, lastName: true } }), getPrisma().employee.count({ where })]);
		return success(items, 200, listMeta(query, items.length, total));
	}
	const where = { deletedAt: null, ...(search ? { assetTag: { contains: search, mode: 'insensitive' as const } } : {}) };
	const [items, total] = await Promise.all([getPrisma().itAsset.findMany({ where, orderBy: [{ assetTag: query.sortOrder }, { id: 'asc' }], skip: query.offset, take: query.limit, select: { id: true, assetTag: true } }), getPrisma().itAsset.count({ where })]);
	return success(items, 200, listMeta(query, items.length, total));
}
