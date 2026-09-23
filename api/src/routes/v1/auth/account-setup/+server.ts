import { hashPassword } from '$lib/server/auth/session';
import { isStrongPassword } from '$lib/server/auth/password';
import { invitationHash, readInvitationToken } from '$lib/server/auth/invitation';
import { writeAuditLog } from '$lib/server/api/admin';
import { failure, success } from '$lib/server/api/response';
import { getPrisma } from '$lib/server/prisma';

const invalid = () => failure(400, 'INVALID_INVITATION', 'This invitation is invalid or has expired.');

export async function POST({ request }: import('./$types').RequestEvent) {
	const token = readInvitationToken(request.headers);
	if (!token) return invalid();
	const body = await request.json().catch(() => null) as Record<string, unknown> | null;
	const password = body && typeof body === 'object' && !Array.isArray(body) ? body.password : null;
	if (typeof password !== 'string' || password.length > 1024 || !isStrongPassword(password)) {
		return failure(400, 'INVALID_PASSWORD', 'Choose a password of at least 12 characters with uppercase, lowercase, and numbers.');
	}
	const tokenHash = invitationHash(token);
	const candidate = await getPrisma().$queryRaw<Array<{ id: number }>>`SELECT id FROM account_invitations WHERE token_hash = ${tokenHash} AND used_at IS NULL AND deleted_at IS NULL AND expires_at > CURRENT_TIMESTAMP LIMIT 1`;
	if (!candidate.length) return invalid();
	const passwordHash = await hashPassword(password);
	const activated = await getPrisma().$transaction(async tx => {
		const locked = await tx.$queryRaw<Array<{ id: number }>>`SELECT id FROM account_invitations WHERE token_hash = ${tokenHash} AND used_at IS NULL AND deleted_at IS NULL AND expires_at > CURRENT_TIMESTAMP FOR UPDATE`;
		if (!locked.length) return false;
		const invitation = await tx.accountInvitation.findFirst({ where: {
			id: locked[0].id, tokenHash, usedAt: null, deletedAt: null, expiresAt: { gt: new Date() },
			employee: {
				deletedAt: null, accountStatus: 'unprovisioned',
				OR: [{ retiredAt: null }, { retiredAt: { gt: new Date() } }],
				roleGrants: { some: { deletedAt: null, scopeType: 'global', role: { deletedAt: null } } }
			}
		}, select: { id: true, employeeId: true, emailAtIssue: true, employee: { select: { email: true } } } });
		if (!invitation || invitation.emailAtIssue !== invitation.employee.email) return false;
		const updated = await tx.employee.updateMany({ where: {
			id: invitation.employeeId, email: invitation.emailAtIssue, deletedAt: null, accountStatus: 'unprovisioned'
		}, data: { passwordHash, accountStatus: 'active', mustChangeCredentials: false } });
		if (updated.count !== 1) return false;
		await tx.accountInvitation.update({ where: { id: invitation.id }, data: { usedAt: new Date() } });
		await tx.accountInvitation.updateMany({ where: {
			employeeId: invitation.employeeId, id: { not: invitation.id }, usedAt: null, deletedAt: null
		}, data: { deletedAt: new Date() } });
		await tx.session.updateMany({ where: { employeeId: invitation.employeeId, deletedAt: null }, data: { deletedAt: new Date() } });
		await writeAuditLog(tx, invitation.employeeId, 'activate_account', 'employee', invitation.employeeId);
		return true;
	}, { isolationLevel: 'ReadCommitted' });
	if (!activated) return invalid();
	const response = success({ accountActivated: true });
	response.headers.set('Cache-Control', 'no-store');
	return response;
}
