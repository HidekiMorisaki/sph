import { dev } from '$app/environment';
import { requireSystemAdminApi } from '$lib/server/api/admin';
import { parseId } from '$lib/server/api/database';
import { failure, success } from '$lib/server/api/response';
import { INVITATION_DAILY_LIMIT, issueInvitation } from '$lib/server/auth/invitation';
import { getPrisma } from '$lib/server/prisma';

export async function POST({ params, locals, url }: import('./$types').RequestEvent) {
	const actor = requireSystemAdminApi(locals.user);
	if (!dev && url.protocol !== 'https:') return failure(403, 'HTTPS_REQUIRED', 'Account invitations require HTTPS.');
	const id = parseId(params.id);
	if (!id) return failure(404, 'NOT_FOUND', 'Not found.');
	const result = await getPrisma().$transaction(async tx => {
		const locked = await tx.$queryRaw<Array<{ id: number }>>`SELECT id FROM employees WHERE id = ${id} AND deleted_at IS NULL FOR UPDATE`;
		if (!locked.length) return { status: 'not_found' as const };
		const employee = await tx.employee.findFirst({ where: {
			id, deletedAt: null, accountStatus: 'unprovisioned',
			OR: [{ retiredAt: null }, { retiredAt: { gt: new Date() } }],
			roleGrants: { some: { deletedAt: null, scopeType: 'global', role: { deletedAt: null } } }
		}, select: { email: true } });
		if (!employee) return { status: 'unavailable' as const };
		const [issuedToday] = await tx.$queryRaw<Array<{ count: bigint }>>`SELECT count(*)::bigint AS count FROM account_invitations WHERE employee_id = ${id} AND created_at >= CURRENT_TIMESTAMP - INTERVAL '24 hours'`;
		if (Number(issuedToday.count) >= INVITATION_DAILY_LIMIT) return { status: 'rate_limited' as const };
		return { status: 'issued' as const, invitation: await issueInvitation(tx, id, actor.id, employee.email) };
	}, { isolationLevel: 'Serializable' });
	if (result.status === 'not_found') return failure(404, 'NOT_FOUND', 'Not found.');
	if (result.status === 'unavailable') return failure(409, 'INVITATION_UNAVAILABLE', 'This account cannot be invited.');
	if (result.status === 'rate_limited') return failure(429, 'INVITATION_RATE_LIMITED', 'Try again later.');
	const response = success(result.invitation, 201);
	response.headers.set('Cache-Control', 'no-store');
	return response;
}
