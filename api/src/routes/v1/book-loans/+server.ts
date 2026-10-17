import { requireOperationApi, writeAuditLog } from '$lib/server/api/admin';
import { requireScopedOperationApi } from '$lib/server/api/branch-access';
import { businessDate, lockBookQueue, reconcileBookQueue } from '$lib/server/api/book-circulation';
import { BookInputError, bookErrorResponse, dateField, nextBookCode, objectBody, positiveId, recordBookChange } from '$lib/server/api/books';
import { listMeta, parseListQuery } from '$lib/server/api/query';
import { failure, success } from '$lib/server/api/response';
import { permissionOperations } from '$lib/server/auth/permissions';
import { getPrisma } from '$lib/server/prisma';

export async function GET({ locals, url }: import('./$types').RequestEvent) {
	const actor = requireOperationApi(locals.user, permissionOperations.bookRead);
	const query = parseListQuery(url, ['dueOn', 'loanedOn', 'createdAt'] as const, 'dueOn');
	const branchRaw = url.searchParams.get('branchId');
	let where: { employeeId?: number; deletedAt: null; copy?: { storage: { branchId: number } } } = { employeeId: actor.id, deletedAt: null };
	if (branchRaw !== null) {
		if (!/^[1-9]\d*$/.test(branchRaw) || !Number.isSafeInteger(Number(branchRaw))) return failure(422, 'INVALID_BRANCH_ID', 'Invalid branch ID.');
		const { branchId } = requireScopedOperationApi(locals.user, permissionOperations.bookManage);
		if (branchId !== null && branchId !== Number(branchRaw)) return failure(403, 'BRANCH_ACCESS_DENIED', 'Branch access is required.');
		where = { deletedAt: null, copy: { storage: { branchId: Number(branchRaw) } } };
	}
	const [items, total] = await Promise.all([
		getPrisma().bookLoan.findMany({ where, select: { id: true, loanCode: true, loanedOn: true, dueOn: true, returnedOn: true, employee: { select: { id: true, employeeCode: true, firstName: true, lastName: true } }, copy: { select: { id: true, copyCode: true, title: { select: { name: true } }, storage: { select: { branchId: true } } } } }, orderBy: [{ [query.sortBy]: query.sortOrder }, { id: 'asc' }], skip: query.offset, take: query.limit }),
		getPrisma().bookLoan.count({ where })
	]);
	return success(items, 200, listMeta(query, items.length, total));
}

export async function POST({ locals, request }: import('./$types').RequestEvent) {
	const { actor, branchId } = requireScopedOperationApi(locals.user, permissionOperations.bookManage);
	try {
		const body = objectBody(await request.json().catch(() => null));
		const copyId = positiveId(body.copyId, 'copyId');
		const employeeId = positiveId(body.employeeId, 'employeeId');
		const loanedOn = dateField(body.loanedOn, 'loanedOn') ?? businessDate();
		const dueOn = dateField(body.dueOn, 'dueOn', true)!;
		if (dueOn < loanedOn) throw new BookInputError([{ field: 'dueOn', reason: 'BEFORE_LOAN' }]);
		const item = await getPrisma().$transaction(async tx => {
			const initial = await tx.bookCopy.findFirst({ where: { id: copyId, deletedAt: null }, select: { titleId: true } });
			if (!initial) throw new BookInputError([{ field: 'copyId', reason: 'NOT_FOUND' }]);
			await lockBookQueue(tx, initial.titleId);
			const copy = await tx.bookCopy.findFirst({ where: { id: copyId, deletedAt: null, status: 'available', title: { deletedAt: null } }, select: { titleId: true, storage: { select: { branchId: true, deletedAt: true } } } });
			if (branchId !== null && copy?.storage.branchId !== branchId) return { kind: 'forbidden' } as const;
			if (!copy || copy.storage.deletedAt) throw new BookInputError([{ field: 'copyId', reason: 'UNAVAILABLE' }]);
			const borrower = await tx.employee.findFirst({ where: { id: employeeId, deletedAt: null, accountStatus: 'active', OR: [{ retiredAt: null }, { retiredAt: { gt: loanedOn } }] }, select: { branchId: true } });
			if (!borrower || (branchId !== null && borrower.branchId !== branchId)) throw new BookInputError([{ field: 'employeeId', reason: 'NOT_FOUND' }]);
			if (await tx.bookLoan.count({ where: { copyId, returnedOn: null, deletedAt: null } })) return { kind: 'conflict' } as const;
			await reconcileBookQueue(tx, copy.titleId, copy.storage.branchId, businessDate());
			const first = await tx.bookReservation.findFirst({ where: { titleId: copy.titleId, branchId: copy.storage.branchId, status: 'held', deletedAt: null }, orderBy: [{ reservedAt: 'asc' }, { id: 'asc' }] });
			if (first && first.employeeId !== employeeId) return { kind: 'reserved' } as const;
			const loanCode = await nextBookCode(tx, 'book_loan_code_seq', 'BL');
			const created = await tx.bookLoan.create({ data: { loanCode, copyId, employeeId, managerId: actor.id, loanedOn, dueOn } });
			if (first) await tx.bookReservation.update({ where: { id: first.id }, data: { status: 'fulfilled' } });
			await recordBookChange(tx, actor.id, 'book_loan', created.id, 'create', { copyId, employeeId, dueOn: dueOn.toISOString().slice(0, 10) });
			await writeAuditLog(tx, actor.id, 'create', 'book_loan', created.id);
			return { kind: 'created', item: created } as const;
		});
		return item.kind === 'created' ? success(item.item, 201) : item.kind === 'forbidden' ? failure(403, 'BRANCH_ACCESS_DENIED', 'Branch access is required.') : item.kind === 'reserved' ? failure(409, 'RESERVED_FOR_ANOTHER', 'This book is reserved for another employee.') : failure(409, 'COPY_ON_LOAN', 'Book copy is already on loan.');
	} catch (error) { return bookErrorResponse(error) ?? Promise.reject(error); }
}
