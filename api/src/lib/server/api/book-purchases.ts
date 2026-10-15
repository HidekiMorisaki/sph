import type { Prisma } from '$lib/server/generated/prisma/client';
import type { AuthenticatedUser } from '$lib/server/auth/types';
import { requireOperationApi, writeAuditLog } from './admin';
import { BookInputError, objectBody, optionalText, positiveId, recordBookChange, requiredText } from './books';
import { throwApiError } from './response';

export const openPurchaseStatuses = ['pending', 'approved', 'ordered'];
export const purchaseActor = (user: AuthenticatedUser | null, operation: string) => {
 const actor = requireOperationApi(user, 'books.read');
 return requireOperationApi(actor, operation);
};

export async function managedPurchaseBranches(tx: Prisma.TransactionClient, actor: AuthenticatedUser) {
 if (!actor.permissionOperations.includes('books.purchases.manage')) return [];
 return (await tx.branch.findMany({ where: { deletedAt: null, OR: [{ managerEmployeeId: actor.id }, { deputyManagerEmployeeId: actor.id }] }, select: { id: true } })).map(branch => branch.id);
}

export async function requirePurchaseManager(tx: Prisma.TransactionClient, actor: AuthenticatedUser, branchId: number) {
 requireOperationApi(actor, 'books.purchases.manage');
 // Lock responsibility and recheck it for the entire write transaction.
 const branches = await tx.$queryRaw<Array<{ id: number }>>`SELECT id FROM branches WHERE id=${branchId} AND deleted_at IS NULL AND (manager_employee_id=${actor.id} OR deputy_manager_employee_id=${actor.id}) FOR SHARE`;
 if (!branches.length) throwApiError(403, 'PURCHASE_MANAGER_REQUIRED', 'The branch principal or deputy is required.');
}

export function purchaseInput(value: unknown) {
 const body = objectBody(value);
 const quantity = positiveId(body.quantity ?? 1, 'quantity');
 if (quantity > 100) throw new BookInputError([{ field: 'quantity', reason: 'COUNT_OUT_OF_RANGE' }]);
 return { quantity, reason: optionalText(body.reason, 'reason', 5000) };
}

export async function createPurchaseRequest(tx: Prisma.TransactionClient, actor: AuthenticatedUser, titleId: number, input: ReturnType<typeof purchaseInput>) {
 purchaseActor(actor, 'books.purchases.create');
 const employee = await tx.employee.findFirst({ where: { id: actor.id, deletedAt: null, branch: { deletedAt: null } }, select: { branchId: true } });
 if (!employee) throwApiError(403, 'BRANCH_ACCESS_DENIED', 'An active branch is required.');
 const branchId = employee.branchId;
 // Also serializes cancellation, approval, and competing requests for this title.
 await tx.$queryRaw`SELECT id FROM book_titles WHERE id=${titleId} AND deleted_at IS NULL FOR UPDATE`;
 if (!await tx.bookTitle.count({ where: { id: titleId, deletedAt: null } })) throwApiError(404, 'NOT_FOUND', 'Book not found.');
 if (await tx.bookPurchaseRequest.count({ where: { titleId, branchId, employeeId: actor.id, deletedAt: null, status: { in: openPurchaseStatuses } } })) throwApiError(409, 'PURCHASE_ALREADY_REQUESTED', 'An open request already exists.');
 const copies = await tx.bookCopy.count({ where: { titleId, deletedAt: null, storage: { branchId, deletedAt: null, room: { deletedAt: null } } } });
 if (copies && !input.reason) throw new BookInputError([{ field: 'reason', reason: 'ADDITIONAL_REASON_REQUIRED' }]);
 const item = await tx.bookPurchaseRequest.create({ data: { titleId, branchId, employeeId: actor.id, kind: copies ? 'additional' : 'new', ...input } });
 await recordBookChange(tx, actor.id, 'book_purchase_request', item.id, 'create', { titleId, branchId, kind: item.kind, quantity: item.quantity });
 await writeAuditLog(tx, actor.id, 'create', 'book_purchase_request', item.id);
 return item;
}

export async function receivePurchaseCopies(tx: Prisma.TransactionClient, actor: AuthenticatedUser, orderId: number, titleId: number, copies: Array<{ id: number; storageId: number }>, storage: Array<{ id: number; branchId: number }>) {
 const order = await tx.bookPurchaseOrder.findFirst({ where: { id: orderId, deletedAt: null }, select: { id: true, titleId: true, branchId: true, quantity: true, status: true } });
 if (!order) throwApiError(404, 'NOT_FOUND', 'Purchase order not found.');
 if (order.titleId !== titleId || copies.some(copy => storage.find(place => place.id === copy.storageId)?.branchId !== order.branchId)) throwApiError(422, 'PURCHASE_COPY_MISMATCH', 'Copies must belong to the ordered title and branch.');
 if (order.status !== 'ordered') throwApiError(409, 'PURCHASE_STATE_CONFLICT', 'The order is not awaiting delivery.');
 const received = await tx.bookCopy.count({ where: { purchaseOrderId: orderId } });
 if (received + copies.length > order.quantity) throwApiError(422, 'PURCHASE_QUANTITY_EXCEEDED', 'Received copies exceed the ordered quantity.');
 await tx.bookCopy.updateMany({ where: { id: { in: copies.map(copy => copy.id) } }, data: { purchaseOrderId: orderId } });
 if (received + copies.length === order.quantity) {
  await tx.bookPurchaseOrder.update({ where: { id: orderId }, data: { status: 'completed' } });
  await tx.bookPurchaseRequest.updateMany({ where: { orderId, deletedAt: null, status: 'ordered' }, data: { status: 'completed' } });
  await recordBookChange(tx, actor.id, 'book_purchase_order', orderId, 'complete', { received: order.quantity });
  await writeAuditLog(tx, actor.id, 'complete', 'book_purchase_order', orderId);
 }
}

export const rejectionReason = (value: unknown) => requiredText(value, 'decisionReason', 5000);
