import { canonicalIsbn } from '$lib/server/api/book-isbn';
import { createPurchaseRequest, purchaseInput, purchaseActor, openPurchaseStatuses, managedPurchaseBranches } from '$lib/server/api/book-purchases';
import { writeAuditLog, requireOperationApi } from '$lib/server/api/admin';
import { BookInputError, bookErrorResponse, nextBookCode, objectBody, optionalText, recordBookChange, requiredText } from '$lib/server/api/books';
import { listMeta, parseListQuery } from '$lib/server/api/query';
import { failure, success } from '$lib/server/api/response';
import { permissionOperations } from '$lib/server/auth/permissions';
import { getPrisma } from '$lib/server/prisma';
import { lookupOpenBdBooks, openBdSourceUrl, BookLookupUnavailable } from '$lib/server/api/openbd-book-lookup';
import { importOpenBdCover, type CoverImport } from '$lib/server/api/openbd-book-cover';

export async function GET({ locals, url }: import('./$types').RequestEvent) {
	const actor = requireOperationApi(locals.user, permissionOperations.bookRead);
	const query = parseListQuery(url, ['name', 'author', 'isbn', 'createdAt'] as const, 'name');
	const q = url.searchParams.get('q')?.trim() ?? '';
	if (q.length > 200) return failure(422, 'INVALID_SEARCH', 'Search is too long.');
	const purchaseBranchIds = [...new Set([actor.branchId, ...await managedPurchaseBranches(getPrisma(), actor)])];
	const purchaseWhere = { branchId: { in: purchaseBranchIds }, branch: { deletedAt: null }, status: { in: openPurchaseStatuses }, deletedAt: null };
	const where = { deletedAt: null, ...(url.searchParams.get('purchaseRequests') === 'true' ? { purchaseRequests: { some: purchaseWhere } } : {}), ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' as const } }, { author: { contains: q, mode: 'insensitive' as const } }, { isbn: { contains: q } }] } : {}) };
	const [items, total] = await Promise.all([
		getPrisma().bookTitle.findMany({ where, select: { id: true, catalogCode: true, name: true, author: true, publisher: true, edition: true, isbn: true, notes: true, sourceProvider: true, sourceUrl: true, sourceRetrievedAt: true, _count: { select: { purchaseRequests: { where: purchaseWhere }, copies: { where: { deletedAt: null } } } } }, orderBy: [{ [query.sortBy]: query.sortOrder }, { id: 'asc' }], skip: query.offset, take: query.limit }),
		getPrisma().bookTitle.count({ where })
	]);
	const titleIds = items.map(item => item.id);
	const [availableCopies, heldReservations] = titleIds.length ? await Promise.all([
		getPrisma().bookCopy.findMany({
			where: { titleId: { in: titleIds }, deletedAt: null, status: 'available', storage: { deletedAt: null } },
			select: { titleId: true, storage: { select: { branchId: true } }, loans: { where: { returnedOn: null, deletedAt: null }, select: { id: true }, take: 1 } }
		}),
		getPrisma().bookReservation.groupBy({
			by: ['titleId', 'branchId'],
			where: { titleId: { in: titleIds }, status: 'held', deletedAt: null },
			_count: { id: true }
		})
	]) : [[], []];
	const branchInventory = new Map<string, { available: number; loaned: number }>();
	for (const copy of availableCopies) {
		const key = `${copy.titleId}:${copy.storage.branchId}`;
		const inventory = branchInventory.get(key) ?? { available: 0, loaned: 0 };
		inventory.available += 1;
		if (copy.loans.length) inventory.loaned += 1;
		branchInventory.set(key, inventory);
	}
	const heldByBranch = new Map(heldReservations.map(reservation => [`${reservation.titleId}:${reservation.branchId}`, reservation._count.id]));
	const rentableTitleIds = new Set([...branchInventory].filter(([key, inventory]) => inventory.available - inventory.loaned - (heldByBranch.get(key) ?? 0) > 0).map(([key]) => Number(key.split(':')[0])));
	return success(items.map(({ _count, ...item }) => ({ ...item, copyCount: _count.copies, purchaseRequestCount: _count.purchaseRequests, rentable: rentableTitleIds.has(item.id) })), 200, listMeta(query, items.length, total));
}

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
