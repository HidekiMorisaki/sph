import { getPrisma } from '$lib/server/prisma';
import { purchaseActor, managedPurchaseBranches, requirePurchaseManager, rejectionReason } from '$lib/server/api/book-purchases';
import { writeAuditLog } from '$lib/server/api/admin';
import { bookErrorResponse, objectBody, positiveId, recordBookChange, BookInputError } from '$lib/server/api/books';
import { parseListQuery, listMeta } from '$lib/server/api/query';
import { success, failure } from '$lib/server/api/response';

export async function GET({ locals, url }: import('./$types').RequestEvent) {
 const actor = purchaseActor(locals.user, 'books.purchases.read');
 const query = parseListQuery(url, ['createdAt', 'status'] as const, 'createdAt');
 const managed = await managedPurchaseBranches(getPrisma(), actor);
 const raw = url.searchParams.get('titleId');
 if (raw !== null && (!/^[1-9]\d*$/.test(raw) || !Number.isSafeInteger(Number(raw)))) return failure(422, 'INVALID_TITLE_ID', 'Invalid title.');
 const where = { deletedAt: null, title: { deletedAt: null }, ...(raw ? { titleId: Number(raw) } : {}), OR: [{ branchId: actor.branchId }, { branchId: { in: managed } }, { requests: { some: { employeeId: actor.id, deletedAt: null } } }] };
 const [rows, total] = await Promise.all([
  getPrisma().bookPurchaseOrder.findMany({ where, select: { id: true, orderCode: true, titleId: true, branchId: true, quantity: true, status: true, decisionReason: true, title: { select: { name: true } }, branch: { select: { name: true } }, _count: { select: { copies: true } } }, orderBy: [{ [query.sortBy]: query.sortOrder }, { id: 'asc' }], skip: query.offset, take: query.limit }),
  getPrisma().bookPurchaseOrder.count({ where })
 ]);
 return success(rows.map(({ _count, ...row }) => ({ ...row, received: _count.copies, canManage: managed.includes(row.branchId) })), 200, listMeta(query, rows.length, total));
}

export async function POST({ locals, request }: import('./$types').RequestEvent) {
 const actor = purchaseActor(locals.user, 'books.purchases.manage');
 try {
  const body = objectBody(await request.json().catch(() => null));
  const titleId = positiveId(body.titleId, 'titleId'), branchId = positiveId(body.branchId, 'branchId');
  if (!Array.isArray(body.requestIds) || body.requestIds.length < 1 || body.requestIds.length > 500) throw new BookInputError([{ field: 'requestIds', reason: 'COUNT_OUT_OF_RANGE' }]);
  const ids = [...new Set(body.requestIds.map(id => positiveId(id, 'requestIds')))];
  const rejected = body.status === 'rejected';
  if (!rejected && body.status !== 'approved') return failure(422, 'INVALID_PURCHASE_STATE', 'Approve or reject pending requests.');
  const reason = rejected ? rejectionReason(body.decisionReason) : null;
  const quantity = rejected ? 1 : positiveId(body.quantity, 'quantity');
  if (quantity > 100) throw new BookInputError([{ field: 'quantity', reason: 'COUNT_OUT_OF_RANGE' }]);
  return await getPrisma().$transaction(async tx => {
   await requirePurchaseManager(tx, actor, branchId);
   await tx.$queryRaw`SELECT id FROM book_titles WHERE id=${titleId} AND deleted_at IS NULL FOR UPDATE`;
   const rows = await tx.bookPurchaseRequest.findMany({ where: { id: { in: ids }, titleId, branchId, deletedAt: null, status: 'pending', title: { deletedAt: null } }, select: { id: true } });
   if (rows.length !== ids.length) return failure(409, 'PURCHASE_STATE_CONFLICT', 'All requests must be pending for the same title and branch.');
   const order = rejected ? null : await tx.bookPurchaseOrder.create({ data: { titleId, branchId, quantity } });
   await tx.bookPurchaseRequest.updateMany({ where: { id: { in: ids } }, data: { status: rejected ? 'rejected' : 'approved', decisionReason: reason, orderId: order?.id ?? null } });
   for (const id of ids) { await recordBookChange(tx, actor.id, 'book_purchase_request', id, rejected ? 'reject' : 'approve', { orderId: order?.id ?? null, decisionReason: reason }); await writeAuditLog(tx, actor.id, rejected ? 'reject' : 'approve', 'book_purchase_request', id); }
   return success(order ?? { status: 'rejected', requestIds: ids }, 201);
  });
 } catch (error) { return bookErrorResponse(error) ?? Promise.reject(error); }
}
