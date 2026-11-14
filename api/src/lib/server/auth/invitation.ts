import { createHash, randomBytes } from 'node:crypto';
import type { Prisma } from '#lib/server/generated/prisma/client.js';
import { writeAuditLog } from '#lib/server/api/admin.js';

import { invitationSettings } from './invitation-settings';

export const INVITATION_DAILY_LIMIT = 5;
export const INVITATION_HEADER = 'x-account-invitation';

export function invitationHash(token: string): string {
	return createHash('sha256').update(token).digest('base64url');
}

export function readInvitationToken(headers: Headers): string | null {
	const token = headers.get(INVITATION_HEADER);
	return token && /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
}

export async function issueInvitation(tx: Prisma.TransactionClient, employeeId: number, issuedById: number, email: string) {
	const { validityMinutes } = await invitationSettings(tx);
	const token = randomBytes(32).toString('base64url');
	const tokenHash = invitationHash(token);
	await tx.$executeRaw`UPDATE account_invitations SET deleted_at = CURRENT_TIMESTAMP WHERE employee_id = ${employeeId} AND used_at IS NULL AND deleted_at IS NULL`;
	const [invitation] = await tx.$queryRaw<Array<{ id: number; expiresEpoch: bigint }>>`
		INSERT INTO account_invitations (token_hash, employee_id, issued_by_id, email_at_issue, expires_at)
		VALUES (${tokenHash}, ${employeeId}, ${issuedById}, ${email}, CURRENT_TIMESTAMP + ${validityMinutes} * INTERVAL '1 minute')
		RETURNING id, (extract(epoch from expires_at) * 1000)::bigint AS "expiresEpoch"
	`;
	await writeAuditLog(tx, issuedById, 'issue_invitation', 'account_invitation', invitation.id);
	return { invitationValidityMinutes: validityMinutes, invitationUrl: `/account-setup#token=${token}`, invitationExpiresAt: new Date(Number(invitation.expiresEpoch)).toISOString() };
}
