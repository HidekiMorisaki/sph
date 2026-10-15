import { getPrisma } from '$lib/server/prisma';
import { purchaseActor, managedPurchaseBranches, createPurchaseRequest, purchaseInput } from '$lib/server/api/book-purchases';
import { bookErrorResponse, objectBody, positiveId } from '$lib/server/api/books';
import { parseListQuery, listMeta } from '$lib/server/api/query';
import { success, failure } from '$lib/server/api/response';

export async function GET({ locals, url }: import('./$types').RequestEvent) {
 const actor = purchaseActor(locals.user, 'books.purchases.read');
 const query = parseListQuery(url, ['createdAt', 'status'] as const, 'createdAt');
 const managed = await managedPurchaseBranches(getPrisma(), actor);
 const raw = url.searchParams.get('titleId');
 if (raw !== null && (!/^[1-9]\d*$/.test(raw) || !Number.isSafeInteger(Number(raw)))) return failure(422, 'INVALID_TITLE_ID', 'Invalid title.');
 const where = { deletedAt: null, title: { deletedAt: null }, ...(raw ? { titleId: Number(raw) } : {}), OR: [{ branchId: actor.branchId }, { employeeId: actor.id }, { branchId: { in: managed } }] };
 const [rows, total] = await Promise.all([
  getPrisma().bookPurchaseRequest.findMany({ where, select: { id: true, titleId: true, branchId: true, employeeId: true, kind: true, quantity: true, reason: true, status: true, decisionReason: true, createdAt: true, orderId: true, title: { select: { name: true } }, branch: { select: { name: true } }, employee: { select: { firstName: true, middleName: true, lastName: true } } }, orderBy: [{ [query.sortBy]: query.sortOrder }, { id: 'asc' }], skip: query.offset, take: query.limit }),
  getPrisma().bookPurchaseRequest.count({ where })
 ]);
 return success(rows.map(({ employeeId, employee, reason, ...row }) => ({ ...row, own: employeeId === actor.id, canManage: managed.includes(row.branchId), canCancel: employeeId === actor.id && row.status === 'pending' && actor.permissionOperations.includes('books.purchases.cancel'), reason: employeeId === actor.id || managed.includes(row.branchId) ? reason : null, employee: employeeId === actor.id || managed.includes(row.branchId) ? employee : null })), 200, listMeta(query, rows.length, total));
}

export async function POST({ locals, request }: import('./$types').RequestEvent) {
 const actor = purchaseActor(locals.user, 'books.purchases.create');
 try {
  const body = objectBody(await request.json().catch(() => null));
  if ('branchId' in body || 'employeeId' in body) return failure(422, 'INVALID_PURCHASE_SCOPE', 'The requester and branch are determined by the server.');
  const titleId = positiveId(body.titleId, 'titleId');
  const item = await getPrisma().$transaction(tx => createPurchaseRequest(tx, actor, titleId, purchaseInput(body)));
  return success(item, 201);
 } catch (error) { return bookErrorResponse(error) ?? Promise.reject(error); }
}
