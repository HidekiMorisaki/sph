import { equivalentIsbns, normalizeIsbn } from './book-isbn';

export type BookLookupCandidate = { title: string; author: string | null; publisher: string | null; edition: string | null; isbn: string; sourceUrl: string; coverUrl: string | null };
export class BookLookupUnavailable extends Error {
	constructor(public code: 'BOOK_LOOKUP_TIMEOUT' | 'BOOK_LOOKUP_UNAVAILABLE' = 'BOOK_LOOKUP_UNAVAILABLE') { super(code); }
}
const ENDPOINT = 'https://api.openbd.jp/v1/get';
const MAX_BYTES = 512_000;
const cache = new Map<string, { expiresAt: number; candidates: BookLookupCandidate[] }>();
const pending = new Map<string, Promise<BookLookupCandidate[]>>();
export function openBdCoverUrl(value: unknown, isbn: string): string | null {
	if (typeof value !== 'string' || value.length > 500) return null;
	try {
		const url = new URL(value);
		const canonical = equivalentIsbns(isbn).find(value => value.length === 13);
		return url.protocol === 'https:' && url.hostname === 'cover.openbd.jp' && !url.port && !url.username && !url.password && !url.search && !url.hash && new RegExp(`^/${canonical}\\.(?:jpg|jpeg|png)$`).test(url.pathname) ? value : null;
	} catch { return null; }
}
export function openBdSourceUrl(isbn: string): string {
	const normalized = normalizeIsbn(isbn);
	if (!normalized) throw new BookLookupUnavailable();
	const canonical = equivalentIsbns(normalized).find(value => value.length === 13)!;
	return `${ENDPOINT}?isbn=${canonical}`;
}
export function parseOpenBdResponse(value: unknown, isbn: string): BookLookupCandidate[] {
	if (!Array.isArray(value) || value.length !== 1) throw new BookLookupUnavailable();
	if (value[0] === null) return [];
	const summary = value[0]?.summary;
	if (!summary || typeof summary !== 'object') throw new BookLookupUnavailable();
	const found = typeof summary.isbn === 'string' ? normalizeIsbn(summary.isbn) : null;
	if (!found || !equivalentIsbns(isbn).includes(found)) throw new BookLookupUnavailable();
	const field = (value: unknown, max: number, required = false): string | null => {
		if (!required && (value === undefined || value === null || value === '')) return null;
		if (typeof value !== 'string' || value.length > max || (required && !value.trim())) throw new BookLookupUnavailable();
		return value;
	};
	return [{ title: field(summary.title, 500, true)!, author: field(summary.author, 500), publisher: field(summary.publisher, 255), edition: typeof value[0]?.hanmoto?.han === 'string' ? field(value[0].hanmoto.han, 100) : null, isbn: found, sourceUrl: openBdSourceUrl(found), coverUrl: openBdCoverUrl(summary.cover, found) }];
}
export async function lookupOpenBdBooks(isbn: string, requestFetch: typeof fetch, refresh = false): Promise<BookLookupCandidate[]> {
	const url = openBdSourceUrl(isbn);
	const cached = cache.get(url);
	if (!refresh && cached && cached.expiresAt > Date.now()) return cached.candidates;
	if (pending.has(url)) return pending.get(url)!;
	if (pending.size >= 2) throw new BookLookupUnavailable();
	const operation = (async () => {
		try {
			const response = await requestFetch(url, { signal: AbortSignal.timeout(8000), redirect: 'error', credentials: 'omit', headers: { accept: 'application/json' } });
			if (!response.ok || !response.body) throw new BookLookupUnavailable();
			const reader = response.body.getReader();
			const chunks: Uint8Array[] = []; let size = 0;
			try {
				for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > MAX_BYTES) { await reader.cancel(); throw new BookLookupUnavailable(); } chunks.push(value); }
			} finally { reader.releaseLock(); }
			const candidates = parseOpenBdResponse(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))), isbn);
			if (cache.size >= 200) cache.clear();
			cache.set(url, { expiresAt: Date.now() + 5 * 60_000, candidates });
			return candidates;
		} catch (error) {
			if (error instanceof BookLookupUnavailable) throw error;
			throw new BookLookupUnavailable(error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError') ? 'BOOK_LOOKUP_TIMEOUT' : 'BOOK_LOOKUP_UNAVAILABLE');
		}
	})();
	pending.set(url, operation);
	try { return await operation; } finally { pending.delete(url); }
}
