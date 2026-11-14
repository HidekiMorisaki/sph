import { requireOperationApi, writeAuditLog } from '#lib/server/api/admin.js';
import { businessDate, lockBookQueue, reconcileBookQueue } from '#lib/server/api/book-circulation.js';
import { recordBookChange } from '#lib/server/api/books.js';
import { failure, success } from '#lib/server/api/response.js';
import { permissionOperations } from '#lib/server/auth/permissions.js';
import { getPrisma } from '#lib/server/prisma.js';

export async function DELETE({ locals, params }: import('./$types').RequestEvent) {
	const actor = requireOperationApi(locals.user, permissionOperations.bookRead);
	const id = Number(params.id);
	if (!Number.isSafeInteger(id) || id < 1) return failure(404, 'NOT_FOUND', 'Reservation not found.');
	const initial = await getPrisma().bookReservation.findFirst({ where: { id, employeeId: actor.id, deletedAt: null } });
	if (!initial) return failure(404, 'NOT_FOUND', 'Reservation not found.');
	const outcome = await getPrisma().$transaction(async tx => {
		await lockBookQueue(tx, initial.titleId);
		const item = await tx.bookReservation.findFirst({ where: { id, employeeId: actor.id, deletedAt: null } });
		if (!item || !['waiting', 'held'].includes(item.status)) return false;
		await tx.bookReservation.update({ where: { id }, data: { status: 'cancelled' } });
		await reconcileBookQueue(tx, item.titleId, item.branchId, businessDate());
		await recordBookChange(tx, actor.id, 'book_reservation', id, 'cancel', { status: 'cancelled' });
		await writeAuditLog(tx, actor.id, 'cancel', 'book_reservation', id);
		return true;
	});
	return outcome ? success({ id, status: 'cancelled' }) : failure(409, 'RESERVATION_INACTIVE', 'Reservation is no longer active.');
}
