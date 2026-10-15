import { writeAuditLog } from '$lib/server/api/admin';
import { requireScopedOperationApi } from '$lib/server/api/branch-access';
import { businessDate, hasSpareAvailableCopy, lockBookQueue, reconcileBookQueue } from '$lib/server/api/book-circulation';
import { BookInputError, bookErrorResponse, dateField, objectBody, optionalText, positiveId, recordBookChange } from '$lib/server/api/books';
import { failure, success } from '$lib/server/api/response';
import { permissionOperations } from '$lib/server/auth/permissions';
import { getPrisma } from '$lib/server/prisma';

const pathId = (value: string) => /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : null;

export async function GET({ locals, params }: import('./$types').RequestEvent) {
	requireScopedOperationApi(locals.user, permissionOperations.bookRead);
	const id = pathId(params.id);
	if (!id) return failure(404, 'NOT_FOUND', 'Book copy not found.');
	const item = await getPrisma().bookCopy.findFirst({ where: { id, deletedAt: null, title: { deletedAt: null } }, select: { id: true, copyCode: true, titleId: true, storageId: true, purchasedOn: true, status: true, notes: true, title: { select: { id: true, name: true, author: true, publisher: true, edition: true, isbn: true } }, storage: { select: { id: true, name: true, branchId: true, room: { select: { name: true, branch: { select: { name: true } } } } } } } });
	return item ? success(item) : failure(404, 'NOT_FOUND', 'Book copy not found.');
}

export async function PATCH({ locals, params, request }: import('./$types').RequestEvent) {
	const { actor, branchId } = requireScopedOperationApi(locals.user, permissionOperations.bookManage);
	const id = pathId(params.id);
	if (!id) return failure(404, 'NOT_FOUND', 'Book copy not found.');
	try {
		const body = objectBody(await request.json().catch(() => null));
		if (!['storageId', 'status', 'purchasedOn', 'notes'].some(key => key in body)) throw new BookInputError([{ reason: 'EMPTY_UPDATE' }]);
		const status = body.status;
		if (status !== undefined && status !== 'available' && status !== 'unavailable') throw new BookInputError([{ field: 'status', reason: 'INVALID_VALUE' }]);
		const data = {
			...('storageId' in body ? { storageId: positiveId(body.storageId, 'storageId') } : {}),
			...('status' in body ? { status: status as string } : {}),
			...('purchasedOn' in body ? { purchasedOn: dateField(body.purchasedOn, 'purchasedOn') } : {}),
			...('notes' in body ? { notes: optionalText(body.notes, 'notes', 5000) } : {})
		};
		const result = await getPrisma().$transaction(async tx => {
			const initial = await tx.bookCopy.findFirst({ where: { id, deletedAt: null }, select: { titleId: true } });
			if (!initial) return { kind: 'missing' } as const;
			await lockBookQueue(tx, initial.titleId);
			const previous = await tx.bookCopy.findFirst({ where: { id, deletedAt: null }, include: { storage: { select: { branchId: true } } } });
			if (!previous) return { kind: 'missing' } as const;
			if (branchId !== null && previous.storage.branchId !== branchId) return { kind: 'forbidden' } as const;
			await reconcileBookQueue(tx, previous.titleId, previous.storage.branchId, businessDate());
			let nextBranchId = previous.storage.branchId;
			if (data.storageId) {
				const storage = await tx.storage.findFirst({ where: { id: data.storageId, deletedAt: null, room: { deletedAt: null, branch: { deletedAt: null } } }, select: { branchId: true } });
				if (branchId !== null && storage?.branchId !== branchId) return { kind: 'forbidden' } as const;
				if (!storage) throw new BookInputError([{ field: 'storageId', reason: 'NOT_FOUND' }]);
				nextBranchId = storage.branchId;
			}
			if ((status === 'unavailable' || (data.storageId && data.storageId !== previous.storageId)) && await tx.bookLoan.count({ where: { copyId: id, returnedOn: null, deletedAt: null } })) return { kind: 'in_use' } as const;
			if (previous.status === 'available' && (status === 'unavailable' || nextBranchId !== previous.storage.branchId) && !await hasSpareAvailableCopy(tx, previous.titleId, previous.storage.branchId)) return { kind: 'reserved' } as const;
			const updated = await tx.bookCopy.update({ where: { id }, data, select: { id: true, copyCode: true, titleId: true, storageId: true, purchasedOn: true, status: true, notes: true } });
			await reconcileBookQueue(tx, previous.titleId, previous.storage.branchId, businessDate());
			if (nextBranchId !== previous.storage.branchId) await reconcileBookQueue(tx, previous.titleId, nextBranchId, businessDate());
			await recordBookChange(tx, actor.id, 'book_copy', id, 'update', { before: { storageId: previous.storageId, status: previous.status }, after: data });
			await writeAuditLog(tx, actor.id, 'update', 'book_copy', id);
			return { kind: 'updated', item: updated } as const;
		});
		return result.kind === 'updated' ? success(result.item) : result.kind === 'forbidden' ? failure(403, 'BRANCH_ACCESS_DENIED', 'Branch access is required.') : result.kind === 'in_use' ? failure(409, 'COPY_ON_LOAN', 'Book copy is on loan.') : result.kind === 'reserved' ? failure(409, 'COPY_HELD', 'Book copy is needed for a held reservation.') : failure(404, 'NOT_FOUND', 'Book copy not found.');
	} catch (error) { return bookErrorResponse(error) ?? Promise.reject(error); }
}

export async function DELETE({ locals, params }: import('./$types').RequestEvent) {
	const { actor, branchId } = requireScopedOperationApi(locals.user, permissionOperations.bookManage);
	const id = pathId(params.id);
	if (!id) return failure(404, 'NOT_FOUND', 'Book copy not found.');
	const outcome = await getPrisma().$transaction(async tx => {
		const initial = await tx.bookCopy.findFirst({ where: { id, deletedAt: null }, select: { titleId: true } });
		if (!initial) return 'missing';
		await lockBookQueue(tx, initial.titleId);
		const copy = await tx.bookCopy.findFirst({ where: { id, deletedAt: null }, include: { storage: { select: { branchId: true } } } });
		if (!copy) return 'missing';
		if (branchId !== null && copy.storage.branchId !== branchId) return 'forbidden';
		await reconcileBookQueue(tx, copy.titleId, copy.storage.branchId, businessDate());
		if (await tx.bookLoan.count({ where: { copyId: id, returnedOn: null, deletedAt: null } })) return 'in_use';
		if (copy.status === 'available' && !await hasSpareAvailableCopy(tx, copy.titleId, copy.storage.branchId)) return 'reserved';
		await tx.bookCopy.update({ where: { id }, data: { deletedAt: new Date() } });
		await reconcileBookQueue(tx, copy.titleId, copy.storage.branchId, businessDate());
		await recordBookChange(tx, actor.id, 'book_copy', id, 'delete', { deleted: true });
		await writeAuditLog(tx, actor.id, 'delete', 'book_copy', id);
		return 'deleted';
	});
	return outcome === 'deleted' ? success({ id }) : outcome === 'forbidden' ? failure(403, 'BRANCH_ACCESS_DENIED', 'Branch access is required.') : outcome === 'in_use' ? failure(409, 'COPY_ON_LOAN', 'Book copy is on loan.') : outcome === 'reserved' ? failure(409, 'COPY_HELD', 'Book copy is needed for a held reservation.') : failure(404, 'NOT_FOUND', 'Book copy not found.');
}
