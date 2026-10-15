import { PNG } from 'pngjs';

export const MAX_BOOK_COVER_BYTES = 1_000_000;
const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

export function normalizeBookCover(bytes: Buffer): Uint8Array<ArrayBuffer> | null {
	if (bytes.length < 24 || bytes.length > MAX_BOOK_COVER_BYTES || !bytes.subarray(0, 8).equals(SIGNATURE)) return null;
	const width = bytes.readUInt32BE(16);
	const height = bytes.readUInt32BE(20);
	if (width < 100 || width > 2000 || height < 100 || height > 2000 || width * height > 4_000_000) return null;
	try {
		const image = PNG.sync.read(bytes);
		if (image.width !== width || image.height !== height || image.data.length !== width * height * 4) return null;
		const normalized = PNG.sync.write(image);
		return normalized.length <= MAX_BOOK_COVER_BYTES ? Uint8Array.from(normalized) : null;
	} catch {
		return null;
	}
}
