import { canonicalIsbn } from '$lib/server/api/book-isbn';
import { createPurchaseRequest, purchaseInput, purchaseActor } from '$lib/server/api/book-purchases';
import { writeAuditLog, requireOperationApi } from '$lib/server/api/admin';
import { BookInputError, bookErrorResponse, nextBookCode, objectBody, optionalText, recordBookChange, requiredText } from '$lib/server/api/books';
import { failure, success } from '$lib/server/api/response';
import { permissionOperations } from '$lib/server/auth/permissions';
import { getPrisma } from '$lib/server/prisma';
import { lookupOpenBdBooks, openBdSourceUrl, BookLookupUnavailable } from '$lib/server/api/openbd-book-lookup';
import { importOpenBdCover, type CoverImport } from '$lib/server/api/openbd-book-cover';

import { bookList } from '$lib/server/api/book-list';
export async function GET({locals,url}: import('./$types').RequestEvent){return bookList(locals.user,url);}

export async function POST({ locals, request, fetch }: import('./$types').RequestEvent) {
	const actor = requireOperationApi(locals.user, permissionOperations.bookRead);
	requireOperationApi(actor, 'books.titles.create');
	try {
		const body = objectBody(await request.json().catch(() => null));
		const name = requiredText(body.name, 'name', 500);
		const author = optionalText(body.author, 'author', 500);
		const publisher = optionalText(body.publisher, 'publisher', 255);
		const edition = optionalText(body.edition, 'edition', 100);
		const rawIsbn = optionalText(body.isbn, 'isbn', 32);
		const isbn = rawIsbn ? canonicalIsbn(rawIsbn) : null;
		if (rawIsbn && !isbn) throw new BookInputError([{ field: 'isbn', reason: 'INVALID_ISBN' }]);
		if ('branchId' in body || 'employeeId' in body) return failure(422, 'INVALID_PURCHASE_SCOPE', 'The branch and requester are determined by the server.');
		const purchase = body.purchaseRequest == null ? null : purchaseInput(body.purchaseRequest);
		if (purchase) purchaseActor(actor, 'books.purchases.create');
		// A request for a known title must not depend on an external provider.
		const knownTitle = isbn && purchase ? await getPrisma().bookTitle.findFirst({ where: { isbn, deletedAt: null }, select: { id: true } }) : null;
		if (knownTitle && purchase) {
			const existing = await getPrisma().$transaction(async tx => {
				await createPurchaseRequest(tx, actor, knownTitle.id, purchase);
				return tx.bookTitle.findUniqueOrThrow({ where: { id: knownTitle.id }, select: { id: true, catalogCode: true, name: true, author: true, publisher: true, edition: true, isbn: true, notes: true, sourceProvider: true, sourceUrl: true, sourceRetrievedAt: true } });
			});
			return success(existing, 201);
		}
		const sourceUrl = optionalText(body.sourceUrl, 'sourceUrl', 500);
		let cover: CoverImport | null = null;
		if (sourceUrl) {
			if (!isbn || sourceUrl !== openBdSourceUrl(isbn)) throw new BookInputError([{ field: 'sourceUrl', reason: 'INVALID_SOURCE' }]);
			const candidate = (await lookupOpenBdBooks(isbn, fetch))[0];
			if (!candidate) return failure(409, 'BOOK_SOURCE_UNAVAILABLE', 'The source record is no longer available.');
			if (candidate.title !== name || candidate.author !== author || candidate.publisher !== publisher || candidate.edition !== edition || canonicalIsbn(candidate.isbn) !== isbn) return failure(422, 'BOOK_SOURCE_READ_ONLY', 'Imported bibliographic fields must match the source.');
			cover = await importOpenBdCover(candidate.coverUrl, candidate.isbn, fetch);
		}
		const notes = optionalText(body.notes, 'notes', 5000);
		const created = await getPrisma().$transaction(async tx => {
			// Serialize ISBN identity creation, including simultaneous requests.
			if (isbn) {
				await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${isbn}, 0))`;
				const existing = await tx.bookTitle.findFirst({ where: { isbn, deletedAt: null } });
				if (existing) {
					if (!purchase) return { duplicateTitleId: existing.id };
					await createPurchaseRequest(tx, actor, existing.id, purchase);
					return existing;
				}
			}
			const catalogCode = await nextBookCode(tx, 'book_catalog_code_seq', 'BT');
			const item = await tx.bookTitle.create({ data: { catalogCode, name, author, publisher, edition, isbn, notes, ...(sourceUrl ? { sourceProvider: 'openbd', sourceUrl, sourceRetrievedAt: new Date() } : {}), ...(cover && cover.status !== 'unavailable' ? cover.data : {}) } });
			await recordBookChange(tx, actor.id, 'book_title', item.id, 'create', { name, catalogCode });
			await writeAuditLog(tx, actor.id, 'create', 'book_title', item.id);
			if (purchase) await createPurchaseRequest(tx, actor, item.id, purchase);
			return item;
		});
		if ('duplicateTitleId' in created) return failure(409, 'DUPLICATE_BOOK_ISBN', 'This ISBN is already registered.', [{ field: 'isbn', reason: 'DUPLICATE_VALUE' }]);
		const { coverImage: _image, ...item } = created;
		return success({ ...item, coverStatus: cover?.status ?? null }, 201);
	} catch (error) {
		if (error instanceof BookLookupUnavailable) return failure(503, error.code, 'Bibliographic lookup is temporarily unavailable.');
		return bookErrorResponse(error) ?? Promise.reject(error);
	}
}
