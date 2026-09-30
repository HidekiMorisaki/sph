import { requireAdminApi } from '$lib/server/api/admin';
import { listMeta, parseListQuery, parseSearch } from '$lib/server/api/query';
import { success } from '$lib/server/api/response';
import type { Prisma } from '$lib/server/generated/prisma/client';
import { getPrisma } from '$lib/server/prisma';
import { roleOutput, roleSelect } from '$lib/server/api/role-output';

const sortFields = ['name'] as const;

export async function GET({ locals, url }: import('./$types').RequestEvent) {
	requireAdminApi(locals.user);
	const query = parseListQuery(url, sortFields, 'name');
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
			orderBy: [{ [query.sortBy]: query.sortOrder }, { id: 'asc' }],
			skip: query.offset,
			take: query.limit
		})
	]);
	const response = success(items.map(roleOutput), 200, listMeta(query, items.length, total));
	response.headers.set('Cache-Control', 'no-store');
	return response;
}
