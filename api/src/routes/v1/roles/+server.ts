import { requireAdminApi } from '$lib/server/api/admin';
import { listMeta, parseListQuery } from '$lib/server/api/query';
import { success } from '$lib/server/api/response';
import { getPrisma } from '$lib/server/prisma';

const sortFields = ['code', 'name'] as const;

export async function GET({ locals, url }: import('./$types').RequestEvent) {
	requireAdminApi(locals.user);
	const query = parseListQuery(url, sortFields, 'name');
	const where = { deletedAt: null };
	const [total, items] = await getPrisma().$transaction([
		getPrisma().role.count({ where }),
		getPrisma().role.findMany({
			where,
			select: { code: true, name: true },
			orderBy: [{ [query.sortBy]: query.sortOrder }, { id: 'asc' }],
			skip: query.offset,
			take: query.limit
		})
	]);
	return success(items, 200, listMeta(query, items.length, total));
}
