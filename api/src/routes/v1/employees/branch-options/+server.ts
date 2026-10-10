import { requireScopedOperationApi } from '$lib/server/api/branch-access';
import { permissionOperations } from '$lib/server/auth/permissions';
import { listMeta, parseListQuery } from '$lib/server/api/query';
import { success } from '$lib/server/api/response';
import { getPrisma } from '$lib/server/prisma';

const sortFields = ['sortOrder', 'name'] as const;

export async function GET({ locals, url }: import('./$types').RequestEvent) {
	const { branchId } = requireScopedOperationApi(locals.user, permissionOperations.employeeRead);
	const query = parseListQuery(url, sortFields, 'sortOrder');
	const where = { deletedAt: null, ...(branchId === null ? {} : { id: branchId }) };
	const [total, items] = await getPrisma().$transaction([
		getPrisma().branch.count({ where }),
		getPrisma().branch.findMany({ where, select: { id: true, name: true }, orderBy: [{ [query.sortBy]: query.sortOrder }, { name: 'asc' }, { id: 'asc' }], skip: query.offset, take: query.limit })
	]);
	return success(items, 200, listMeta(query, items.length, total));
}
