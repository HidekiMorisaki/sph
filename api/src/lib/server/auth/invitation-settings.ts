import type { Prisma } from '#lib/server/generated/prisma/client.js';

export async function invitationSettings(tx: Prisma.TransactionClient) {
	const setting = await tx.accountInvitationSetting.findFirst({ where: { key: 'main', deletedAt: null }, select: { validityMinutes: true } });
	return setting ?? { validityMinutes: 30 };
}
