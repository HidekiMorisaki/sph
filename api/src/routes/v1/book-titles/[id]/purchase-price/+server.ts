import { requireOperationApi } from '#lib/server/api/admin.js';
import { parseId } from '#lib/server/api/database.js';
import { getPrisma } from '#lib/server/prisma.js';
import { lookupOpenBdBooks, BookLookupUnavailable } from '#lib/server/api/openbd-book-lookup.js';
import { failure, success } from '#lib/server/api/response.js';

const limits = new Map<number, { count: number; until: number }>();
export async function GET({ locals, params, fetch }: import('./$types').RequestEvent) {
	const actor = requireOperationApi(locals.user, 'books.read');
	const id = parseId(params.id);
	if (!id) return failure(404, 'NOT_FOUND', 'Book not found.');
	const book = await getPrisma().bookTitle.findFirst({ where: { id, deletedAt: null }, select: { isbn: true } });
	if (!book) return failure(404, 'NOT_FOUND', 'Book not found.');
	if (!book.isbn) return success({ amount: null, currency: null, sourceUrl: null });
	const now = Date.now();
	for (const [key, value] of limits) if (value.until <= now) limits.delete(key);
	const limit = limits.get(actor.id) ?? { count: 0, until: now + 60_000 };
	if (limit.count >= 10 || !limits.has(actor.id) && limits.size >= 1000) return failure(429, 'BOOK_LOOKUP_RATE_LIMITED', 'Try again later.');
	limit.count++; limits.set(actor.id, limit);
	try {
		const candidate = (await lookupOpenBdBooks(book.isbn, fetch))[0];
		return success({ amount: null, currency: null, ...candidate?.purchasePrice, sourceUrl: candidate?.sourceUrl ?? null });
	} catch (error) {
		return failure(503, error instanceof BookLookupUnavailable ? error.code : 'BOOK_LOOKUP_UNAVAILABLE', 'Purchase price is temporarily unavailable.');
	}
}
