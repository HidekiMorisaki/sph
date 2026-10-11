import { createHash } from 'node:crypto';
import { PNG } from 'pngjs';

export const AVATAR_SIZE = 256;
export const MAX_UPLOAD_BYTES = 400_000;
export const AVATAR_THUMBNAIL_SIZE = 48;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const thumbnailCache = new Map<string, string | null>();
const THUMBNAIL_CACHE_LIMIT = 512;

export function normalizeAvatarImage(bytes: Buffer): Uint8Array<ArrayBuffer> | null {
	if (bytes.length < 24 || bytes.length > MAX_UPLOAD_BYTES || !bytes.subarray(0, 8).equals(PNG_SIGNATURE) ||
		bytes.readUInt32BE(16) !== AVATAR_SIZE || bytes.readUInt32BE(20) !== AVATAR_SIZE) return null;
	try {
		const decoded = PNG.sync.read(bytes);
		if (decoded.width !== AVATAR_SIZE || decoded.height !== AVATAR_SIZE || decoded.data.length !== AVATAR_SIZE * AVATAR_SIZE * 4) return null;
		const normalized = PNG.sync.write(decoded);
		return normalized.length <= MAX_UPLOAD_BYTES ? Uint8Array.from(normalized) : null;
	} catch {
		return null;
	}
}

export function avatarThumbnailDataUrl(image: Uint8Array): string | null {
	const cacheKey = createHash('sha256').update(image).digest('base64url');
	if (thumbnailCache.has(cacheKey)) return thumbnailCache.get(cacheKey) ?? null;
	let thumbnail: string | null = null;
	try {
		const source = PNG.sync.read(Buffer.from(image));
		if (source.width === AVATAR_SIZE && source.height === AVATAR_SIZE) {
			const target = new PNG({ width: AVATAR_THUMBNAIL_SIZE, height: AVATAR_THUMBNAIL_SIZE });
			for (let y = 0; y < AVATAR_THUMBNAIL_SIZE; y += 1) {
				for (let x = 0; x < AVATAR_THUMBNAIL_SIZE; x += 1) {
					const sourceX = Math.min(AVATAR_SIZE - 1, Math.floor((x + 0.5) * AVATAR_SIZE / AVATAR_THUMBNAIL_SIZE));
					const sourceY = Math.min(AVATAR_SIZE - 1, Math.floor((y + 0.5) * AVATAR_SIZE / AVATAR_THUMBNAIL_SIZE));
					const from = (sourceY * AVATAR_SIZE + sourceX) * 4;
					const to = (y * AVATAR_THUMBNAIL_SIZE + x) * 4;
					target.data.set(source.data.subarray(from, from + 4), to);
				}
			}
			thumbnail = `data:image/png;base64,${PNG.sync.write(target).toString('base64')}`;
		}
	} catch {
		// A damaged stored image falls back to the employee monogram.
	}
	thumbnailCache.set(cacheKey, thumbnail);
	if (thumbnailCache.size > THUMBNAIL_CACHE_LIMIT) thumbnailCache.delete(thumbnailCache.keys().next().value!);
	return thumbnail;
}
