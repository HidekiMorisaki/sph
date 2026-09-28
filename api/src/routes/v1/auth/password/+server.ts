import { requireAuthenticatedApi, writeAuditLog } from '$lib/server/api/admin';
import { failure, success } from '$lib/server/api/response';
import { isStrongPassword } from '$lib/server/auth/password';
import { hashPassword, SESSION_COOKIE_NAME, verifyPassword } from '$lib/server/auth/session';
import { getPrisma } from '$lib/server/prisma';

export async function PATCH({ request, cookies, locals }: import('./$types').RequestEvent) {
	const actor = requireAuthenticatedApi(locals.user);
	const body = await request.json().catch(() => null) as Record<string, unknown> | null;
	const currentPassword = body?.currentPassword;
	const newPassword = body?.newPassword;
	const confirmation = body?.confirmation;
	if (typeof currentPassword !== 'string' || currentPassword.length === 0 || currentPassword.length > 1024) {
		return failure(400, 'VALIDATION_ERROR', 'One or more fields are invalid.', [{ field: 'currentPassword', reason: 'Enter your current password.' }]);
	}
	if (typeof newPassword !== 'string' || newPassword.length > 1024 || !isStrongPassword(newPassword)) {
		return failure(400, 'VALIDATION_ERROR', 'One or more fields are invalid.', [{ field: 'newPassword', reason: 'Use at least 12 characters with uppercase, lowercase, and numbers.' }]);
	}
	if (confirmation !== newPassword) {
		return failure(400, 'VALIDATION_ERROR', 'One or more fields are invalid.', [{ field: 'confirmation', reason: 'The passwords do not match.' }]);
	}
	if (currentPassword === newPassword) {
		return failure(400, 'VALIDATION_ERROR', 'One or more fields are invalid.', [{ field: 'newPassword', reason: 'Choose a password different from your current password.' }]);
	}

	const employee = await getPrisma().employee.findFirst({ where: { id: actor.id, deletedAt: null, accountStatus: 'active' }, select: { passwordHash: true } });
	if (!employee?.passwordHash || !(await verifyPassword(currentPassword, employee.passwordHash))) {
		return failure(400, 'INVALID_CURRENT_PASSWORD', 'The current password is incorrect.', [{ field: 'currentPassword', reason: 'The current password is incorrect.' }]);
	}

	const passwordHash = await hashPassword(newPassword);
	await getPrisma().$transaction(async (tx) => {
		await tx.employee.update({ where: { id: actor.id }, data: { passwordHash } });
		await tx.session.updateMany({ where: { employeeId: actor.id, deletedAt: null }, data: { deletedAt: new Date() } });
		await writeAuditLog(tx, actor.id, 'change_password', 'employee', actor.id);
	});
	cookies.delete(SESSION_COOKIE_NAME, { path: '/' });
	return success({ passwordChanged: true, signedOut: true });
}
