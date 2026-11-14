import { requireOperationApi, requireSystemAdminApi, writeAuditLog } from '#lib/server/api/admin.js';
import { failure, success } from '#lib/server/api/response.js';
import { invitationSettings } from '#lib/server/auth/invitation-settings.js';
import { getPrisma } from '#lib/server/prisma.js';

export async function GET({ locals }: import('./$types').RequestEvent) {
	requireSystemAdminApi(locals.user);
	requireOperationApi(locals.user, 'system.invitations.read');
	return success(await invitationSettings(getPrisma()));
}

export async function PATCH({ locals, request }: import('./$types').RequestEvent) {
	const actor = requireSystemAdminApi(locals.user);
	requireOperationApi(actor, 'system.invitations.update');
	const body: unknown = await request.json().catch(() => null);
	if (!body || typeof body !== 'object' || Array.isArray(body) || !('validityMinutes' in body) ||
		Object.keys(body).some(key => key !== 'validityMinutes') ||
		typeof body.validityMinutes !== 'number' || !Number.isInteger(body.validityMinutes) || body.validityMinutes < 1 || body.validityMinutes > 60) {
		return failure(400, 'VALIDATION_ERROR', 'Validity must be an integer between 1 and 60 minutes.');
	}
	const validityMinutes = body.validityMinutes;
	const settings = await getPrisma().$transaction(async tx => {
		const item = await tx.accountInvitationSetting.upsert({ where: { key: 'main' }, create: { key: 'main', validityMinutes }, update: { validityMinutes, deletedAt: null } });
		await writeAuditLog(tx, actor.id, 'update', 'account_invitation_setting', item.id, { validityMinutes });
		return { validityMinutes: item.validityMinutes };
	});
	return success(settings);
}
