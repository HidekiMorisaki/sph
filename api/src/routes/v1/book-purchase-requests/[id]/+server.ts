import { getPrisma } from '$lib/server/prisma';
import { purchaseActor } from '$lib/server/api/book-purchases';
import { writeAuditLog } from '$lib/server/api/admin';
import { recordBookChange } from '$lib/server/api/books';
import { success, failure } from '$lib/server/api/response';

export async function PATCH({ locals, params, request }: import('./$types').RequestEvent) {
 const actor = purchaseActor(locals.user, 'books.purchases.cancel');
 const body = await request.json().catch(() => null);
 if (!body || body.status !== 'cancelled' || Object.keys(body).some(key => key !== 'status')) return failure(422, 'INVALID_PURCHASE_STATE', 'Only cancellation is permitted.');
 const id = Number(params.id);
 if (!Number.isSafeInteger(id) || id < 1) return failure(404, 'NOT_FOUND', 'Request not found.');
 return getPrisma().$transaction(async tx => {
  const item = await tx.bookPurchaseRequest.findFirst({ where: { id, employeeId: actor.id, deletedAt: null } });
  if (!item) return failure(404, 'NOT_FOUND', 'Request not found.');
  await tx.$queryRaw`SELECT id FROM book_titles WHERE id=${item.titleId} FOR UPDATE`;
  const result = await tx.bookPurchaseRequest.updateMany({ where: { id, employeeId: actor.id, status: 'pending', deletedAt: null }, data: { status: 'cancelled' } });
  if (!result.count) return failure(409, 'PURCHASE_STATE_CONFLICT', 'Only pending requests can be cancelled.');
  await recordBookChange(tx, actor.id, 'book_purchase_request', id, 'cancel', { status: 'cancelled' });
  await writeAuditLog(tx, actor.id, 'cancel', 'book_purchase_request', id);
  return success({ id, status: 'cancelled' });
 });
}
