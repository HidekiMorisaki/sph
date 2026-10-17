import { writeAuditLog } from '$lib/server/api/admin';
import { requireScopedOperationApi } from '$lib/server/api/branch-access';
import { businessDate, lockBookQueue, reconcileBookQueue } from '$lib/server/api/book-circulation';
import { BookInputError, bookErrorResponse, dateField, objectBody, recordBookChange } from '$lib/server/api/books';
import { failure, success } from '$lib/server/api/response';
import { permissionOperations } from '$lib/server/auth/permissions';
import { getPrisma } from '$lib/server/prisma';

export async function PATCH({ locals, params, request }: import('./$types').RequestEvent) {
	const { actor, branchId } = requireScopedOperationApi(locals.user, permissionOperations.bookManage);
	const id = Number(params.id);
	if (!Number.isSafeInteger(id) || id < 1) return failure(404, 'NOT_FOUND', 'Loan not found.');
	try {
		const body = objectBody(await request.json().catch(() => null));
		const returnedOn = dateField(body.returnedOn, 'returnedOn') ?? businessDate();
		const initial = await getPrisma().bookLoan.findFirst({ where: { id, deletedAt: null }, select: { copy: { select: { titleId: true } } } });
		if (!initial) return failure(404, 'NOT_FOUND', 'Loan not found.');
		const outcome = await getPrisma().$transaction(async tx => {
			await lockBookQueue(tx, initial.copy.titleId);
			const loan = await tx.bookLoan.findFirst({ where: { id, deletedAt: null }, include: { copy: { select: { titleId: true, storage: { select: { branchId: true } } } } } });
			if (!loan) return 'missing';
			if (branchId !== null && loan.copy.storage.branchId !== branchId) return 'forbidden';
			if (loan.returnedOn) return 'returned';
			if (returnedOn < loan.loanedOn) throw new BookInputError([{ field: 'returnedOn', reason: 'BEFORE_LOAN' }]);
			await tx.bookLoan.update({ where: { id }, data: { returnedOn } });
			await reconcileBookQueue(tx, loan.copy.titleId, loan.copy.storage.branchId, businessDate());
			await recordBookChange(tx, actor.id, 'book_loan', id, 'return', { returnedOn: returnedOn.toISOString().slice(0, 10) });
			await writeAuditLog(tx, actor.id, 'return', 'book_loan', id);
			return 'returned_now';
		});
		return outcome === 'returned_now' ? success({ id, returnedOn }) : outcome === 'forbidden' ? failure(403, 'BRANCH_ACCESS_DENIED', 'Branch access is required.') : outcome === 'returned' ? failure(409, 'ALREADY_RETURNED', 'Book was already returned.') : failure(404, 'NOT_FOUND', 'Loan not found.');
	} catch (error) { return bookErrorResponse(error) ?? Promise.reject(error); }
}
