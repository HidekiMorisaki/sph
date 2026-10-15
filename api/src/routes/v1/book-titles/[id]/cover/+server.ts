import { requireOperationApi, writeAuditLog } from '$lib/server/api/admin';
import { MAX_BOOK_COVER_BYTES, normalizeBookCover } from '$lib/server/api/book-cover';
import { recordBookChange } from '$lib/server/api/books';
import { failure, success } from '$lib/server/api/response';
import { permissionOperations } from '$lib/server/auth/permissions';
import { getPrisma } from '$lib/server/prisma';

const pathId = (value: string) => /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : null;
export async function GET({ locals, params }: import('./$types').RequestEvent) {
	requireOperationApi(locals.user, permissionOperations.bookRead);
	const id = pathId(params.id);
	if (!id) return failure(404, 'NOT_FOUND', 'Book title not found.');
	const title = await getPrisma().bookTitle.findFirst({ where: { id, deletedAt: null }, select: { coverImage: true, coverSource: true } });
	if (!title) return failure(404, 'NOT_FOUND', 'Book title not found.');
	const response = success({ image: title.coverImage ? `data:image/png;base64,${Buffer.from(title.coverImage).toString('base64')}` : null, source: title.coverSource });
	response.headers.set('cache-control', 'private, no-store');
	return response;
}
export async function PUT({ locals, params, request }: import('./$types').RequestEvent) {
	const actor = requireOperationApi(locals.user, 'books.covers.update');
	requireOperationApi(actor, permissionOperations.bookManage);
	const id = pathId(params.id);
	if (!id) return failure(404, 'NOT_FOUND', 'Book title not found.');
	if (!request.headers.get('content-type')?.toLowerCase().startsWith('multipart/form-data;')) return failure(415, 'UNSUPPORTED_MEDIA_TYPE', 'A PNG image is required.');
	const form = await request.formData().catch(() => null);
	const file = form?.get('image');
	if (!(file instanceof File) || file.type !== 'image/png' || file.size === 0 || file.size > MAX_BOOK_COVER_BYTES) return failure(400, 'INVALID_IMAGE', 'A PNG image up to 1 MB is required.');
	const image = normalizeBookCover(Buffer.from(await file.arrayBuffer()));
	if (!image) return failure(400, 'INVALID_IMAGE', 'Invalid PNG dimensions or content.');
	const updated = await getPrisma().$transaction(async tx => {
		const rows = await tx.$queryRaw<Array<{ id: number }>>`SELECT id FROM book_titles WHERE id = ${id} AND deleted_at IS NULL FOR UPDATE`;
		if (!rows.length) return false;
		await tx.bookTitle.update({ where: { id }, data: { coverImage: image, coverSource: 'manual', coverSourceUrl: null } });
		await recordBookChange(tx, actor.id, 'book_title', id, 'cover', { updated: true });
		await writeAuditLog(tx, actor.id, 'update_cover', 'book_title', id);
		return true;
	});
	return updated ? success({ id }) : failure(404, 'NOT_FOUND', 'Book title not found.');
}
