import { requireAuthenticatedApi } from '$lib/server/api/admin';
import { parseId } from '$lib/server/api/database';
import { listMeta, parseListQuery } from '$lib/server/api/query';
import { failure, success } from '$lib/server/api/response';
import { getPrisma } from '$lib/server/prisma';

const sortFields = ['changedAt', 'id'] as const;

export async function GET({ params, locals, url }: import('./$types').RequestEvent) {
	requireAuthenticatedApi(locals.user);
	const employeeId = parseId(params.id);
	if (!employeeId) return failure(404, 'NOT_FOUND', 'Not found.');
	const query = parseListQuery(url, sortFields, 'changedAt');
	const prisma = getPrisma();
	if (!await prisma.employee.count({ where: { id: employeeId, deletedAt: null } })) return failure(404, 'NOT_FOUND', 'Not found.');
	const where = { employeeId, deletedAt: null };
	const [total, items] = await prisma.$transaction([
		prisma.employeeChangeHistory.count({ where }),
		prisma.employeeChangeHistory.findMany({
			where,
			select: {
				id: true,
				action: true,
				changes: true,
				changedAt: true,
				actor: { select: { firstName: true, middleName: true, lastName: true } }
			},
			orderBy: [{ [query.sortBy]: query.sortOrder }, { id: 'desc' }],
			skip: query.offset,
			take: query.limit
		})
	]);
	return success(items.map((item) => ({
		id: item.id,
		action: item.action,
		changes: item.changes,
		changedAt: item.changedAt,
		actorName: [item.actor.firstName, item.actor.middleName, item.actor.lastName].filter(Boolean).join(' ')
	})), 200, listMeta(query, items.length, total));
}
