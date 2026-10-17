import { requireOperationApi } from '$lib/server/api/admin';
import { equivalentIsbns, normalizeIsbn } from '$lib/server/api/book-isbn';
import { lookupOpenBdBooks, BookLookupUnavailable } from '$lib/server/api/openbd-book-lookup';
import { importOpenBdCover } from '$lib/server/api/openbd-book-cover';
import { failure, success } from '$lib/server/api/response';
import { permissionOperations } from '$lib/server/auth/permissions';
import { getPrisma } from '$lib/server/prisma';

const limits = new Map<number, { count: number; resetsAt: number }>();

export async function GET({ locals, url, fetch }: import('./$types').RequestEvent) {
	const actor = requireOperationApi(locals.user, permissionOperations.bookRead);
	requireOperationApi(actor, 'books.titles.create');
	const raw = url.searchParams.get('isbn') ?? '';
	const isbn = raw.length <= 32 ? normalizeIsbn(raw) : null;
	if (!isbn) return noStore(failure(422, 'INVALID_ISBN', 'Enter a valid ISBN-10 or ISBN-13.'));
	const now = Date.now();
	const previous = limits.get(actor.id);
	const limit = !previous || previous.resetsAt <= now ? { count: 1, resetsAt: now + 60_000 } : { count: previous.count + 1, resetsAt: previous.resetsAt };
	limits.set(actor.id, limit);
	if (limits.size > 1000) for (const [id, value] of limits) if (value.resetsAt <= now) limits.delete(id);
	if (limit.count > 10) return noStore(failure(429, 'BOOK_LOOKUP_RATE_LIMITED', 'Try again later.'));
	const existingTitle = await getPrisma().bookTitle.findFirst({ where: { deletedAt: null, isbn: { in: equivalentIsbns(isbn) } }, select: { id: true, name: true }, orderBy: { id: 'asc' } });
	try {
		const books = await lookupOpenBdBooks(isbn, fetch);
		const candidates = await Promise.all(books.map(async candidate => {
			const cover = await importOpenBdCover(candidate.coverUrl, candidate.isbn, fetch);
			return { ...candidate, coverImage: cover.status === 'stored' && cover.data.coverImage
				? `data:image/png;base64,${Buffer.from(cover.data.coverImage).toString('base64')}` : null };
		}));
		return noStore(success({ candidates, existingTitle }));
	} catch (error) {
		return noStore(failure(503, error instanceof BookLookupUnavailable ? error.code : 'BOOK_LOOKUP_UNAVAILABLE', 'Bibliographic lookup is temporarily unavailable.'));
	}
}

function noStore(response: Response): Response {
	response.headers.set('Cache-Control', 'no-store');
	return response;
}
