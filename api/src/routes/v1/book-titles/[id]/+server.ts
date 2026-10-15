import { canonicalIsbn } from '$lib/server/api/book-isbn';
import { requireOperationApi, writeAuditLog } from '$lib/server/api/admin';
import { BookInputError, bookErrorResponse, objectBody, optionalText, recordBookChange, requiredText } from '$lib/server/api/books';
import { failure, success } from '$lib/server/api/response';
import { permissionOperations } from '$lib/server/auth/permissions';
import { getPrisma } from '$lib/server/prisma';
import { lookupOpenBdBooks, BookLookupUnavailable } from '$lib/server/api/openbd-book-lookup';
import { importOpenBdCover } from '$lib/server/api/openbd-book-cover';

const pathId = (value: string) => /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : null;

export async function GET({ locals, params }: import('./$types').RequestEvent) {
	requireOperationApi(locals.user, permissionOperations.bookRead);
	const id = pathId(params.id);
	if (!id) return failure(404, 'NOT_FOUND', 'Book title not found.');
	const item = await getPrisma().bookTitle.findFirst({
		where: { id, deletedAt: null },
		select: {
			id: true, catalogCode: true, name: true, author: true, publisher: true, edition: true, isbn: true, notes: true, sourceProvider: true, sourceUrl: true, sourceRetrievedAt: true,
			copies: {
				where: { deletedAt: null },
				select: {
					id: true, copyCode: true, status: true, storageId: true,
					storage: {
						select: { name: true, branchId: true, room: { select: { name: true, branch: { select: { name: true } } } } }
					}
				}
			}
		}
	});
	return item ? success(item) : failure(404, 'NOT_FOUND', 'Book title not found.');
}

export async function PATCH({ locals, params, request, fetch }: import('./$types').RequestEvent) {
	const actor = requireOperationApi(locals.user, permissionOperations.bookTitleManage);
	const id = pathId(params.id);
	if (!id) return failure(404, 'NOT_FOUND', 'Book title not found.');
	try {
		const body = objectBody(await request.json().catch(() => null));
		if (body.refreshSource === true) {
			if (Object.keys(body).some(key => key !== 'refreshSource')) return failure(422, 'BOOK_SOURCE_READ_ONLY', 'Refresh cannot edit bibliographic fields.');
			const previous = await getPrisma().bookTitle.findFirst({ where: { id, deletedAt: null }, select: { isbn: true, sourceProvider: true, coverSource: true } });
			if (!previous) return failure(404, 'NOT_FOUND', 'Book title not found.');
			if (previous.sourceProvider !== 'openbd' || !previous.isbn) return failure(422, 'INVALID_SOURCE', 'This book is not sourced from openBD.');
			const candidate = (await lookupOpenBdBooks(previous.isbn, fetch, true))[0];
			const cover = previous.coverSource === 'manual' ? null : await importOpenBdCover(candidate?.coverUrl ?? null, previous.isbn, fetch);
			const updated = await getPrisma().$transaction(async tx => {
				const rows = await tx.$queryRaw<Array<{ id: number; cover_source: string | null }>>`SELECT id, cover_source FROM book_titles WHERE id = ${id} AND deleted_at IS NULL FOR UPDATE`;
				if (!rows.length) return false;
				await tx.bookTitle.update({ where: { id }, data: { ...(candidate ? { name: candidate.title, author: candidate.author, publisher: candidate.publisher, edition: candidate.edition, sourceRetrievedAt: new Date() } : {}), ...(rows[0].cover_source !== 'manual' && cover && cover.status !== 'unavailable' ? cover.data : {}) } });
				await recordBookChange(tx, actor.id, 'book_title', id, 'refresh_source', { provider: 'openbd', available: Boolean(candidate), coverStatus: cover?.status ?? 'manual' });
				await writeAuditLog(tx, actor.id, 'refresh_source', 'book_title', id);
				return true;
			});
			if (!updated) return failure(404, 'NOT_FOUND', 'Book title not found.');
			return candidate ? success({ id, coverStatus: cover?.status ?? 'manual' }) : failure(409, 'BOOK_SOURCE_UNAVAILABLE', 'The source record is no longer available.');
		}
		const allowed = ['name', 'author', 'publisher', 'edition', 'isbn', 'notes'];
		if (!allowed.some(key => key in body)) throw new BookInputError([{ reason: 'EMPTY_UPDATE' }]);
		const data = {
			...('name' in body ? { name: requiredText(body.name, 'name', 500) } : {}),
			...('author' in body ? { author: optionalText(body.author, 'author', 500) } : {}),
			...('publisher' in body ? { publisher: optionalText(body.publisher, 'publisher', 255) } : {}),
			...('edition' in body ? { edition: optionalText(body.edition, 'edition', 100) } : {}),
			...('notes' in body ? { notes: optionalText(body.notes, 'notes', 5000) } : {}),
			...('isbn' in body ? { isbn: body.isbn == null || body.isbn === '' ? null : canonicalIsbn(requiredText(body.isbn, 'isbn', 32)) } : {})
		};
		if ('isbn' in body && body.isbn != null && body.isbn !== '' && !data.isbn) throw new BookInputError([{ field: 'isbn', reason: 'INVALID_ISBN' }]);
		const item = await getPrisma().$transaction(async tx => {
			const previous = await tx.bookTitle.findFirst({ where: { id, deletedAt: null } });
			if (!previous) return null;
			const metadataChanged = (['name', 'author', 'publisher', 'edition', 'isbn'] as const).some(key => key in data && data[key] !== previous[key]);
			if (previous.sourceProvider === 'openbd' && metadataChanged) throw new BookInputError([{ reason: 'BOOK_SOURCE_READ_ONLY' }]);
			const updated = await tx.bookTitle.update({ where: { id }, data, select: { id: true, catalogCode: true, name: true, author: true, publisher: true, edition: true, isbn: true, notes: true, sourceProvider: true, sourceUrl: true, sourceRetrievedAt: true } });
			await recordBookChange(tx, actor.id, 'book_title', id, 'update', { before: { name: previous.name, isbn: previous.isbn }, after: data });
			await writeAuditLog(tx, actor.id, 'update', 'book_title', id);
			return updated;
		});
		return item ? success(item) : failure(404, 'NOT_FOUND', 'Book title not found.');
	} catch (error) { return error instanceof BookLookupUnavailable ? failure(503, error.code, 'Bibliographic lookup is temporarily unavailable.') : bookErrorResponse(error) ?? Promise.reject(error); }
}

export async function DELETE({ locals, params }: import('./$types').RequestEvent) {
	const actor = requireOperationApi(locals.user, permissionOperations.bookTitleManage);
	const id = pathId(params.id);
	if (!id) return failure(404, 'NOT_FOUND', 'Book title not found.');
	const outcome = await getPrisma().$transaction(async tx => {
		await tx.$queryRaw`SELECT id FROM book_titles WHERE id=${id} AND deleted_at IS NULL FOR UPDATE`;
		if (!await tx.bookTitle.count({ where: { id, deletedAt: null } })) return 'missing';
		if (await tx.bookPurchaseRequest.count({ where: { titleId: id, deletedAt: null } })) return 'purchases';
		if (await tx.bookCopy.count({ where: { titleId: id, deletedAt: null } }) || await tx.bookReservation.count({ where: { titleId: id, status: { in: ['waiting', 'held'] }, deletedAt: null } })) return 'in_use';
		await tx.bookTitle.update({ where: { id }, data: { deletedAt: new Date() } });
		await recordBookChange(tx, actor.id, 'book_title', id, 'delete', { deleted: true });
		await writeAuditLog(tx, actor.id, 'delete', 'book_title', id);
		return 'deleted';
	});
	return outcome === 'deleted' ? success({ id }) : outcome === 'purchases' ? failure(409, 'PURCHASE_HISTORY_PRESENT', 'Book titles with purchase requests are retained for their history.') : outcome === 'in_use' ? failure(409, 'TITLE_IN_USE', 'Book title has copies or reservations.') : failure(404, 'NOT_FOUND', 'Book title not found.');
}
