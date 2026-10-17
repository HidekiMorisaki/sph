import { MAX_BOOK_COVER_BYTES, normalizeBookCover } from './book-cover';
import { openBdCoverUrl } from './openbd-book-lookup';
import { decode } from 'jpeg-js';
import { PNG } from 'pngjs';

type StoredCover = { coverImage: Uint8Array<ArrayBuffer> | null; coverSource: 'openbd' | null; coverSourceUrl: string | null };
export type CoverImport = { status: 'stored' | 'missing'; data: StoredCover } | { status: 'unavailable' };
const empty: StoredCover = { coverImage: null, coverSource: null, coverSourceUrl: null };
let activeDownloads = 0;

// Bound dimensions before decoding; pixel content and dimensions are preserved.
export function isBoundedJpeg(bytes: Buffer): boolean {
	if (bytes.length < 12 || bytes.length > MAX_BOOK_COVER_BYTES || bytes.readUInt16BE(0) !== 0xffd8 || bytes.readUInt16BE(bytes.length - 2) !== 0xffd9) return false;
	let offset = 2; let dimensions = false;
	while (offset + 4 <= bytes.length - 2) {
		if (bytes[offset++] !== 0xff) return false;
		while (bytes[offset] === 0xff) offset++;
		const marker = bytes[offset++];
		if (marker === 0xda) return dimensions;
		if (marker === undefined || marker === 0 || marker === 0xd8 || marker === 0xd9 || marker >= 0xd0 && marker <= 0xd7 || offset + 2 > bytes.length) return false;
		const length = bytes.readUInt16BE(offset);
		if (length < 2 || offset + length > bytes.length - 2) return false;
		if ([0xc0, 0xc1, 0xc2].includes(marker)) {
			if (length < 11 || bytes[offset + 2] !== 8) return false;
			const height = bytes.readUInt16BE(offset + 3); const width = bytes.readUInt16BE(offset + 5);
			const components = bytes[offset + 7];
			if (![1, 3, 4].includes(components) || length !== 8 + 3 * components || width < 100 || width > 2000 || height < 100 || height > 2000 || width * height > 4_000_000) return false;
			dimensions = true;
		}
		offset += length;
	}
	return false;
}

export async function importOpenBdCover(coverUrl: string | null, isbn: string, requestFetch: typeof fetch): Promise<CoverImport> {
	if (!coverUrl) return { status: 'missing', data: { ...empty } };
	if (!openBdCoverUrl(coverUrl, isbn) || activeDownloads >= 2) return { status: 'unavailable' };
	activeDownloads++;
	try {
		const response = await requestFetch(coverUrl, { signal: AbortSignal.timeout(8000), redirect: 'error', credentials: 'omit', headers: { accept: 'image/png, image/jpeg' } });
		if (response.status === 404 || response.status === 410) { await response.body?.cancel(); return { status: 'missing', data: { ...empty } }; }
		const mediaType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
		if (!response.ok || !response.body || !['image/png', 'image/jpeg'].includes(mediaType ?? '') || Number(response.headers.get('content-length')) > MAX_BOOK_COVER_BYTES) { await response.body?.cancel(); return { status: 'unavailable' }; }
		const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
		try {
			for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > MAX_BOOK_COVER_BYTES) { await reader.cancel(); return { status: 'unavailable' }; } chunks.push(value); }
		} finally { reader.releaseLock(); }
		const bytes = Buffer.concat(chunks);
		const png = mediaType === 'image/png' ? normalizeBookCover(bytes) : jpegToPng(bytes);
		if (!png) return { status: 'unavailable' };
		return { status: 'stored', data: { coverImage: png, coverSource: 'openbd', coverSourceUrl: coverUrl } };
	} catch { return { status: 'unavailable' }; }
	finally { activeDownloads--; }
}

export function jpegToPng(bytes: Buffer): Uint8Array<ArrayBuffer> | null {
	if (!isBoundedJpeg(bytes)) return null;
	try {
		const decoded = decode(bytes, { formatAsRGBA: true, tolerantDecoding: false, maxResolutionInMP: 4, maxMemoryUsageInMB: 128 });
		if (decoded.width < 100 || decoded.width > 2000 || decoded.height < 100 || decoded.height > 2000 || decoded.data.length !== decoded.width * decoded.height * 4) return null;
		const image = new PNG({ width: decoded.width, height: decoded.height }); image.data = decoded.data;
		const png = PNG.sync.write(image);
		// JPEG to PNG can grow in size; uploads/downloads remain capped at 1 MB.
		return png.length <= 4_000_000 ? Uint8Array.from(png) : null;
	} catch { return null; }
}
