import { requireOperationApi } from '#lib/server/api/admin.js';
import { businessDate, plusDays } from '#lib/server/api/book-circulation.js';
import { success } from '#lib/server/api/response.js';
import { permissionOperations } from '#lib/server/auth/permissions.js';
import { getPrisma } from '#lib/server/prisma.js';

export async function GET({ locals }: import('./$types').RequestEvent) {
	const actor = requireOperationApi(locals.user, permissionOperations.bookRead);
	const today = businessDate();
	const loans = await getPrisma().bookLoan.findMany({ where: { employeeId: actor.id, returnedOn: null, deletedAt: null, dueOn: { lte: plusDays(today, 7) }, copy: { deletedAt: null } }, select: { id: true, dueOn: true, copy: { select: { copyCode: true, title: { select: { name: true } } } } }, orderBy: [{ dueOn: 'asc' }, { id: 'asc' }], take: 100 });
	return success(loans.map(loan => ({ id: loan.id, dueOn: loan.dueOn, copyCode: loan.copy.copyCode, title: loan.copy.title.name, kind: loan.dueOn < today ? 'overdue' : 'due_soon' })));
}
