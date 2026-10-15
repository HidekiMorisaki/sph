import { getPrisma } from '$lib/server/prisma';
import { purchaseActor, requirePurchaseManager, rejectionReason } from '$lib/server/api/book-purchases';
import { writeAuditLog } from '$lib/server/api/admin';
import { bookErrorResponse, objectBody, recordBookChange } from '$lib/server/api/books';
import { success, failure } from '$lib/server/api/response';

export async function PATCH({ locals, params, request }: import('./$types').RequestEvent) {
 const actor = purchaseActor(locals.user, 'books.purchases.manage');
 const id = Number(params.id);
 if (!Number.isSafeInteger(id) || id < 1) return failure(404, 'NOT_FOUND', 'Order not found.');
 try {
  const body = objectBody(await request.json().catch(() => null));
  if (!['ordered', 'rejected'].includes(String(body.status))) return failure(422, 'INVALID_PURCHASE_STATE', 'Order or reject an approved purchase.');
  const status = String(body.status), reason = status === 'rejected' ? rejectionReason(body.decisionReason) : null;
  return await getPrisma().$transaction(async tx => {
   const item = await tx.bookPurchaseOrder.findFirst({ where: { id, deletedAt: null }, select: { titleId: true, branchId: true } });
   if (!item) return failure(404, 'NOT_FOUND', 'Order not found.');
   await requirePurchaseManager(tx, actor, item.branchId);
   await tx.$queryRaw`SELECT id FROM book_titles WHERE id=${item.titleId} FOR UPDATE`;
   const changed = await tx.bookPurchaseOrder.updateMany({ where: { id, status: 'approved', deletedAt: null }, data: { status, decisionReason: reason } });
   if (!changed.count) return failure(409, 'PURCHASE_STATE_CONFLICT', 'Only approved purchases can be ordered or rejected.');
   await tx.bookPurchaseRequest.updateMany({ where: { orderId: id, deletedAt: null, status: 'approved' }, data: { status, decisionReason: reason } });
   await recordBookChange(tx, actor.id, 'book_purchase_order', id, status, { decisionReason: reason });
   await writeAuditLog(tx, actor.id, status, 'book_purchase_order', id);
   return success({ id, status });
  });
 } catch (error) { return bookErrorResponse(error) ?? Promise.reject(error); }
}
