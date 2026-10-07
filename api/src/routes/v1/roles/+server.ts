import { requireOperationApi } from '$lib/server/api/admin';
import { hasPermissionOperation, permissionOperations } from '$lib/server/auth/permissions';
import { listMeta, parseListQuery, parseSearch } from '$lib/server/api/query';
import { success } from '$lib/server/api/response';
import type { Prisma } from '$lib/server/generated/prisma/client';
import { getPrisma } from '$lib/server/prisma';
import { roleOutput, roleSelect } from '$lib/server/api/role-output';

const sortFields = ['name', 'sortOrder'] as const;

export async function GET({ locals, url }: import('./$types').RequestEvent) {
	if (!locals.user || !hasPermissionOperation(locals.user, permissionOperations.systemManagement)) requireOperationApi(locals.user, permissionOperations.roleRead);
	const query = parseListQuery(url, sortFields, 'sortOrder');
	const search = parseSearch(url);
	const where: Prisma.RoleWhereInput = {
		deletedAt: null,
		...(search ? { name: { contains: search, mode: 'insensitive' } } : {})
	};
	const [total, items] = await getPrisma().$transaction([
		getPrisma().role.count({ where }),
		getPrisma().role.findMany({
			where,
			select: roleSelect,
			orderBy: [{ [query.sortBy]: query.sortOrder }, ...(query.sortBy === 'sortOrder' ? [{ name: 'asc' as const }] : []), { id: 'asc' }],
			skip: query.offset,
			take: query.limit
		})
	]);
	const response = success(items.map(roleOutput), 200, listMeta(query, items.length, total));
	response.headers.set('Cache-Control', 'no-store');
	return response;
}
