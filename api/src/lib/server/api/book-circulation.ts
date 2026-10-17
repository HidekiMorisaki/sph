import { Prisma } from '$lib/server/generated/prisma/client';

// The first release uses the business date in Japan, where the initial branches operate.
export function businessDate(): Date {
	const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
	const field = (name: string) => parts.find(part => part.type === name)?.value;
	return new Date(`${field('year')}-${field('month')}-${field('day')}T00:00:00.000Z`);
}

export function plusDays(date: Date, days: number): Date {
	return new Date(date.getTime() + days * 86400000);
}

export async function lockBookQueue(tx: Prisma.TransactionClient, titleId: number): Promise<void> {
	await tx.$queryRaw<Array<{ id: number }>>`SELECT id FROM book_titles WHERE id = ${titleId} AND deleted_at IS NULL FOR UPDATE`;
}

export async function hasSpareAvailableCopy(tx: Prisma.TransactionClient, titleId: number, branchId: number): Promise<boolean> {
	const copies = await tx.bookCopy.findMany({ where: { titleId, status: 'available', deletedAt: null, storage: { branchId, deletedAt: null } }, select: { id: true } });
	const activeLoans = await tx.bookLoan.count({ where: { copyId: { in: copies.map(copy => copy.id) }, returnedOn: null, deletedAt: null } });
	const held = await tx.bookReservation.count({ where: { titleId, branchId, status: 'held', deletedAt: null } });
	return copies.length - activeLoans > held;
}

export async function reconcileBookQueue(tx: Prisma.TransactionClient, titleId: number, branchId: number, today: Date): Promise<void> {
	await tx.bookReservation.updateMany({ where: { titleId, branchId, status: 'held', expiresOn: { lt: today }, deletedAt: null }, data: { status: 'expired' } });
	const copies = await tx.bookCopy.findMany({ where: { titleId, deletedAt: null, status: 'available', storage: { branchId, deletedAt: null } }, select: { id: true } });
	const activeLoans = await tx.bookLoan.count({ where: { copyId: { in: copies.map(copy => copy.id) }, returnedOn: null, deletedAt: null } });
	const held = await tx.bookReservation.count({ where: { titleId, branchId, status: 'held', expiresOn: { gte: today }, deletedAt: null } });
	const slots = Math.max(0, copies.length - activeLoans - held);
	if (!slots) return;
	const waiting = await tx.bookReservation.findMany({ where: { titleId, branchId, status: 'waiting', deletedAt: null }, orderBy: [{ reservedAt: 'asc' }, { id: 'asc' }], take: slots, select: { id: true } });
	for (const reservation of waiting) await tx.bookReservation.update({ where: { id: reservation.id }, data: { status: 'held', expiresOn: plusDays(today, 7) } });
}
