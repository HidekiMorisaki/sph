import { receivePurchaseCopies } from '$lib/server/api/book-purchases';
import { writeAuditLog, requireOperationApi } from '$lib/server/api/admin';
import { requireScopedOperationApi } from '$lib/server/api/branch-access';
import { businessDate, lockBookQueue, reconcileBookQueue } from '$lib/server/api/book-circulation';
import { BookInputError, bookErrorResponse, contentHash, dateField, nextBookCode, objectBody, optionalText, positiveId, recordBookChange } from '$lib/server/api/books';
import { listMeta, parseListQuery } from '$lib/server/api/query';
import { failure, success, throwApiError } from '$lib/server/api/response';
import { permissionOperations } from '$lib/server/auth/permissions';
import { hasOwnBranchPermissionOperation, hasPermissionOperation } from '$lib/server/auth/permissions';
import { getPrisma } from '$lib/server/prisma';

type CopyInput = { storageId: number; status: 'available' | 'unavailable'; notes: string | null; copyCode: string | null };

function parseCopies(body: Record<string, unknown>) {
	const titleId = positiveId(body.titleId, 'titleId');
	const purchasedOn = dateField(body.purchasedOn, 'purchasedOn');
	if (!Array.isArray(body.copies) || body.copies.length < 1 || body.copies.length > 100) throw new BookInputError([{ field: 'copies', reason: 'COUNT_OUT_OF_RANGE' }]);
	const copies: CopyInput[] = body.copies.map((raw, index) => {
		const row = objectBody(raw);
		const storageId = positiveId(row.storageId, `copies[${index}].storageId`);
		const status = row.status ?? 'available';
		if (status !== 'available' && status !== 'unavailable') throw new BookInputError([{ field: `copies[${index}].status`, reason: 'INVALID_VALUE' }]);
		const notes = optionalText(row.notes, `copies[${index}].notes`, 5000);
		const copyCode = optionalText(row.copyCode, `copies[${index}].copyCode`, 40);
		if (copyCode && !/^[\p{L}\p{N}][\p{L}\p{N}_.-]*$/u.test(copyCode)) throw new BookInputError([{ field: `copies[${index}].copyCode`, reason: 'INVALID_CODE' }]);
		return { storageId, status, notes, copyCode };
	});
	const seen = new Set<string>();
	for (let index = 0; index < copies.length; index++) {
		const code = copies[index].copyCode?.toLowerCase();
		if (code && seen.has(code)) throw new BookInputError([{ field: `copies[${index}].copyCode`, reason: 'DUPLICATE_VALUE' }]);
		if (code) seen.add(code);
	}
	return { titleId, purchasedOn, copies, purchaseOrderId: body.purchaseOrderId == null ? null : positiveId(body.purchaseOrderId, 'purchaseOrderId') };
}

export async function GET({ locals, url }: import('./$types').RequestEvent) {
	const actor = requireOperationApi(locals.user, permissionOperations.bookRead);
	const query = parseListQuery(url, ['copyCode', 'purchasedOn', 'createdAt'] as const, 'copyCode');
	const titleRaw = url.searchParams.get('titleId');
	if (titleRaw !== null && !/^[1-9]\d*$/.test(titleRaw)) return failure(422, 'INVALID_TITLE_ID', 'titleId must be a positive integer.');
	const titleId = titleRaw ? Number(titleRaw) : null;
	if (titleId !== null && !Number.isSafeInteger(titleId)) return failure(422, 'INVALID_TITLE_ID', 'titleId is too large.');
	const where = { deletedAt: null, title: { deletedAt: null }, ...(titleId ? { titleId } : {}) };
	const [items, total] = await Promise.all([
		getPrisma().bookCopy.findMany({ where, select: { id: true, copyCode: true, titleId: true, storageId: true, purchasedOn: true, status: true, notes: true, title: { select: { name: true, author: true, isbn: true } }, storage: { select: { name: true, branchId: true, room: { select: { name: true, branch: { select: { name: true } } } } } }, loans: { where: { returnedOn: null, deletedAt: null }, take: 1, select: { id: true, employee: { select: { id: true, employeeCode: true, firstName: true, lastName: true } }, dueOn: true } } }, orderBy: [{ [query.sortBy]: query.sortOrder }, { id: 'asc' }], skip: query.offset, take: query.limit }),
		getPrisma().bookCopy.count({ where })
	]);
	const globalManager = hasPermissionOperation(actor, permissionOperations.bookManage);
	const branchManager = hasOwnBranchPermissionOperation(actor, permissionOperations.bookManage);
	return success(items.map(item => ({ ...item, onLoan: item.loans.length > 0, loans: globalManager || (branchManager && actor.branchId === item.storage.branchId) ? item.loans : [] })), 200, listMeta(query, items.length, total));
}

export async function POST({ locals, request }: import('./$types').RequestEvent) {
	const { actor, branchId } = requireScopedOperationApi(locals.user, permissionOperations.bookManage);
	const key = request.headers.get('Idempotency-Key');
	if (!key || !/^[A-Za-z0-9_-]{16,100}$/.test(key)) return failure(422, 'INVALID_IDEMPOTENCY_KEY', 'Idempotency-Key must be 16–100 ASCII characters.');
	let hash = '';
	try {
		const parsed = parseCopies(objectBody(await request.json().catch(() => null)));
		hash = contentHash(parsed);
		const existingResult = async () => {
			const batch = await getPrisma().bookCopyBatch.findUnique({ where: { requestKey: key } });
			if (!batch) return null;
			if (batch.actorId !== actor.id || batch.bodyHash !== hash || !batch.result) return failure(409, 'IDEMPOTENCY_KEY_REUSED', 'Idempotency-Key was used for another request.');
			return success(batch.result, 201);
		};
		const previous = await existingResult();
		if (previous) return previous;
		const created = await getPrisma().$transaction(async tx => {
			await lockBookQueue(tx, parsed.titleId);
			await tx.$queryRaw`SELECT id FROM book_titles WHERE id=${parsed.titleId} FOR UPDATE`;
			if (!await tx.bookTitle.count({ where: { id: parsed.titleId, deletedAt: null } })) throw new BookInputError([{ field: 'titleId', reason: 'NOT_FOUND' }]);
			const storageIds = [...new Set(parsed.copies.map(row => row.storageId))];
			const storage = await tx.storage.findMany({ where: { id: { in: storageIds }, deletedAt: null, room: { deletedAt: null, branch: { deletedAt: null } } }, select: { id: true, branchId: true } });
			const storageById = new Map(storage.map(row => [row.id, row]));
			if (branchId !== null && parsed.copies.some(row => storageById.get(row.storageId)?.branchId !== branchId)) throwApiError(403, 'BRANCH_ACCESS_DENIED', 'Branch access is required.');
			const invalidStorage = parsed.copies.flatMap((row, index) => storageById.has(row.storageId) ? [] : [{ field: `copies[${index}].storageId`, reason: 'NOT_FOUND' }]);
			if (invalidStorage.length) throw new BookInputError(invalidStorage);
			const manualCodes = parsed.copies.flatMap(row => row.copyCode ? [row.copyCode] : []);
			const usedCodes = await tx.bookCopy.findMany({ where: { copyCode: { in: manualCodes } }, select: { copyCode: true } });
			const used = new Set(usedCodes.map(row => row.copyCode));
			const duplicateCodes = parsed.copies.flatMap((row, index) => row.copyCode && used.has(row.copyCode) ? [{ field: `copies[${index}].copyCode`, reason: 'DUPLICATE_VALUE' }] : []);
			if (duplicateCodes.length) throw new BookInputError(duplicateCodes);
			const batch = await tx.bookCopyBatch.create({ data: { requestKey: key, actorId: actor.id, bodyHash: hash } });
			const result = [];
			for (const row of parsed.copies) {
				const copyCode = row.copyCode ?? await nextBookCode(tx, 'book_copy_code_seq', 'BK');
				const copy = await tx.bookCopy.create({ data: { titleId: parsed.titleId, storageId: row.storageId, purchasedOn: parsed.purchasedOn, status: row.status, notes: row.notes, copyCode, batchId: batch.id } });
				await recordBookChange(tx, actor.id, 'book_copy', copy.id, 'create', { titleId: copy.titleId, copyCode, storageId: copy.storageId });
				await writeAuditLog(tx, actor.id, 'create', 'book_copy', copy.id);
				result.push({ id: copy.id, copyCode, storageId: copy.storageId });
			}
			if (parsed.purchaseOrderId) await receivePurchaseCopies(tx, actor, parsed.purchaseOrderId, parsed.titleId, result, storage);
			await tx.bookCopyBatch.update({ where: { id: batch.id }, data: { result } });
			for (const branch of new Set(storage.filter(place => parsed.copies.some(copy => copy.storageId === place.id)).map(place => place.branchId))) await reconcileBookQueue(tx, parsed.titleId, branch, businessDate());
			return result;
		});
		return success(created, 201);
	} catch (error) {
		if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
			const batch = await getPrisma().bookCopyBatch.findUnique({ where: { requestKey: key } });
			if (batch) return batch.actorId === actor.id && batch.bodyHash === hash && batch.result
				? success(batch.result, 201) : failure(409, 'IDEMPOTENCY_KEY_REUSED', 'Idempotency-Key was used for another request.');
		}
		return bookErrorResponse(error) ?? Promise.reject(error);
	}
}
