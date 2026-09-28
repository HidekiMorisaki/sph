import type { Prisma } from '$lib/server/generated/prisma/client';

export async function syncEmployeePositions(
	tx: Prisma.TransactionClient,
	employeeId: number,
	positionIds: number[],
	primaryPositionId: number | null
) {
	const now = new Date();
	await tx.employeePosition.updateMany({
		where: { employeeId, deletedAt: null },
		data: { isPrimary: false }
	});
	await tx.employeePosition.updateMany({
		where: { employeeId, deletedAt: null, positionId: { notIn: positionIds } },
		data: { deletedAt: now }
	});
	for (const positionId of positionIds) {
		const existing = await tx.employeePosition.findUnique({
			where: { employeeId_positionId: { employeeId, positionId } },
			select: { id: true }
		});
		const data = { deletedAt: null, isPrimary: positionId === primaryPositionId };
		if (existing) await tx.employeePosition.update({ where: { id: existing.id }, data });
		else await tx.employeePosition.create({ data: { employeeId, positionId, ...data } });
	}
}
