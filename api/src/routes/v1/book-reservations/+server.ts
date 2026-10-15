import { requireOperationApi, writeAuditLog } from '$lib/server/api/admin';
import { businessDate, lockBookQueue, reconcileBookQueue } from '$lib/server/api/book-circulation';
import { BookInputError, bookErrorResponse, nextBookCode, objectBody, positiveId, recordBookChange } from '$lib/server/api/books';
import { listMeta, parseListQuery } from '$lib/server/api/query';
import { failure, success } from '$lib/server/api/response';
import { permissionOperations } from '$lib/server/auth/permissions';
import { getPrisma } from '$lib/server/prisma';

export async function GET({ locals, url }: import('./$types').RequestEvent) {
	const actor = requireOperationApi(locals.user, permissionOperations.bookRead);
	const query = parseListQuery(url, ['reservedAt', 'status'] as const, 'reservedAt');
	const where = { employeeId: actor.id, deletedAt: null };
	const [items, total] = await Promise.all([
		getPrisma().bookReservation.findMany({ where, select: { id: true, reservationCode: true, status: true, reservedAt: true, expiresOn: true, branch: { select: { name: true } }, title: { select: { id: true, name: true, author: true } } }, orderBy: [{ [query.sortBy]: query.sortOrder }, { id: 'asc' }], skip: query.offset, take: query.limit }),
		getPrisma().bookReservation.count({ where })
	]);
	return success(items, 200, listMeta(query, items.length, total));
}

export async function POST({ locals, request }: import('./$types').RequestEvent) {
	const actor = requireOperationApi(locals.user, permissionOperations.bookRead);
	try {
		const body = objectBody(await request.json().catch(() => null));
		const titleId = positiveId(body.titleId, 'titleId');
		const branchId = positiveId(body.branchId, 'branchId');
		const item = await getPrisma().$transaction(async tx => {
			await lockBookQueue(tx, titleId);
			if (!await tx.bookTitle.count({ where: { id: titleId, deletedAt: null } })) throw new BookInputError([{ field: 'titleId', reason: 'NOT_FOUND' }]);
			if (!await tx.branch.count({ where: { id: branchId, deletedAt: null } })) throw new BookInputError([{ field: 'branchId', reason: 'NOT_FOUND' }]);
			if (!await tx.bookCopy.count({ where: { titleId, deletedAt: null, storage: { branchId, deletedAt: null } } })) throw new BookInputError([{ field: 'branchId', reason: 'NO_COPIES' }]);
			const active = await tx.bookReservation.findFirst({ where: { titleId, employeeId: actor.id, status: { in: ['waiting', 'held'] }, deletedAt: null } });
			if (active) throw new BookInputError([{ field: 'titleId', reason: 'ALREADY_RESERVED' }]);
			await reconcileBookQueue(tx, titleId, branchId, businessDate());
			const reservationCode = await nextBookCode(tx, 'book_reservation_code_seq', 'BR');
			const created = await tx.bookReservation.create({ data: { reservationCode, titleId, employeeId: actor.id, branchId } });
			await reconcileBookQueue(tx, titleId, branchId, businessDate());
			await recordBookChange(tx, actor.id, 'book_reservation', created.id, 'create', { titleId, branchId });
			await writeAuditLog(tx, actor.id, 'create', 'book_reservation', created.id);
			return tx.bookReservation.findUniqueOrThrow({ where: { id: created.id } });
		});
		return success(item, 201);
	} catch (error) { return bookErrorResponse(error) ?? Promise.reject(error); }
}
