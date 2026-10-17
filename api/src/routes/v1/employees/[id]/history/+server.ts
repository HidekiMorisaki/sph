import { requireScopedOperationApi } from '$lib/server/api/branch-access';
import { permissionOperations } from '$lib/server/auth/permissions';
import { parseId } from '$lib/server/api/database';
import { listMeta, parseListQuery } from '$lib/server/api/query';
import { failure, success } from '$lib/server/api/response';
import { getPrisma } from '$lib/server/prisma';

const sortFields = ['changedAt', 'id'] as const;

export async function GET({ params, locals, url }: import('./$types').RequestEvent) {
	const { actor, branchId } = requireScopedOperationApi(locals.user, permissionOperations.employeeRead);
	const employeeId = parseId(params.id);
	if (!employeeId) return failure(404, 'NOT_FOUND', 'Not found.');
	const query = parseListQuery(url, sortFields, 'changedAt');
	const prisma = getPrisma();
	if (!await prisma.employee.count({ where: { id: employeeId, ...(branchId === null ? {} : { branchId }) } })) return failure(404, 'NOT_FOUND', 'Not found.');
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
		changes: actor.permissionOperations.includes('teams.read') || !Array.isArray(item.changes) ? item.changes : item.changes.filter(change => !(typeof change === 'object' && change !== null && !Array.isArray(change) && change.field === 'teams')),
		changedAt: item.changedAt,
		actor: item.actor
	})), 200, listMeta(query, items.length, total));
}
