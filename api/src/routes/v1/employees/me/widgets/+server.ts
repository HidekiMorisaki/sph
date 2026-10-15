import { requireAuthenticatedApi } from '$lib/server/api/admin';
import { failure, success } from '$lib/server/api/response';
import { getPrisma } from '$lib/server/prisma';

const allowed = ['book_notices', 'book_loans', 'account'] as const;
const defaults = [{ code: 'book_notices', enabled: true, sortOrder: 0 }, { code: 'book_loans', enabled: true, sortOrder: 1 }, { code: 'account', enabled: true, sortOrder: 2 }];

export async function GET({ locals }: import('./$types').RequestEvent) {
	const actor = requireAuthenticatedApi(locals.user);
	const items = await getPrisma().employeeWidget.findMany({ where: { employeeId: actor.id, deletedAt: null }, select: { code: true, enabled: true, sortOrder: true }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] });
	return success(items.length ? items : defaults);
}

export async function PUT({ locals, request }: import('./$types').RequestEvent) {
	const actor = requireAuthenticatedApi(locals.user);
	const body = await request.json().catch(() => null);
	if (!Array.isArray(body) || body.length !== allowed.length || new Set(body.map(row => row?.code)).size !== allowed.length || body.some(row => !row || typeof row !== 'object' || !allowed.includes(row.code) || typeof row.enabled !== 'boolean' || !Number.isSafeInteger(row.sortOrder) || row.sortOrder < 0 || row.sortOrder >= allowed.length)) return failure(422, 'INVALID_WIDGETS', 'Invalid widget settings.');
	if (new Set(body.map(row => row.sortOrder)).size !== body.length) return failure(422, 'INVALID_WIDGET_ORDER', 'Widget order must be unique.');
	const items = await getPrisma().$transaction(async tx => {
		for (const row of body as Array<{ code: string; enabled: boolean; sortOrder: number }>) await tx.employeeWidget.upsert({ where: { employeeId_code: { employeeId: actor.id, code: row.code } }, create: { employeeId: actor.id, code: row.code, enabled: row.enabled, sortOrder: row.sortOrder }, update: { enabled: row.enabled, sortOrder: row.sortOrder, deletedAt: null } });
		return tx.employeeWidget.findMany({ where: { employeeId: actor.id, deletedAt: null }, select: { code: true, enabled: true, sortOrder: true }, orderBy: { sortOrder: 'asc' } });
	});
	return success(items);
}
