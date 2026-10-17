import { requireOperationApi } from '$lib/server/api/admin';
import { listMeta, parseListQuery } from '$lib/server/api/query';
import { success } from '$lib/server/api/response';
import { permissionOperations } from '$lib/server/auth/permissions';
import { getPrisma } from '$lib/server/prisma';

export async function GET({ locals, url }: import('./$types').RequestEvent) {
	const actor = requireOperationApi(locals.user, permissionOperations.bookRead);
	const query = parseListQuery(url, ['dueOn', 'loanedOn'] as const, 'dueOn');
	const where = { employeeId: actor.id, deletedAt: null };
	const [items, total] = await Promise.all([
		getPrisma().bookLoan.findMany({ where, select: { id: true, loanedOn: true, dueOn: true, returnedOn: true, copy: { select: { copyCode: true, title: { select: { name: true } } } } }, orderBy: [{ [query.sortBy]: query.sortOrder }, { id: 'asc' }], skip: query.offset, take: query.limit }),
		getPrisma().bookLoan.count({ where })
	]);
	return success(items, 200, listMeta(query, items.length, total));
}
