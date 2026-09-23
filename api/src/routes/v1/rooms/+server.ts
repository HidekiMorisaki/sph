import { requireAdminApi, requireAuthenticatedApi, writeAuditLog } from '$lib/server/api/admin';
import { listMeta, parseListQuery } from '$lib/server/api/query';
import { failure, success } from '$lib/server/api/response';
import type { Prisma } from '$lib/server/generated/prisma/client';
import { getPrisma } from '$lib/server/prisma';

const sortFields = ['id', 'code', 'name', 'branchId', 'createdAt', 'updatedAt'] as const;
function input(value: unknown) {
	if (!value || typeof value !== 'object') return null; const body = value as Record<string, unknown>;
	const code = typeof body.code === 'string' ? body.code.trim() : ''; const name = typeof body.name === 'string' ? body.name.trim() : '';
	const branchId = typeof body.branchId === 'number' ? body.branchId : typeof body.branchId === 'string' && /^\d+$/.test(body.branchId) ? Number(body.branchId) : 0;
	const floor = typeof body.floor === 'string' && body.floor.trim() ? body.floor.trim() : null;
	return code && name && branchId > 0 ? { code, name, branchId, floor } : null;
}
export async function GET({ locals, url }: import('./$types').RequestEvent) {
	requireAuthenticatedApi(locals.user); const query = parseListQuery(url, sortFields, 'code');
	const orderBy = [{ [query.sortBy]: query.sortOrder }, { id: 'asc' as const }] as Prisma.RoomOrderByWithRelationInput[];
	const [total, items] = await getPrisma().$transaction([getPrisma().room.count({ where: { deletedAt: null } }), getPrisma().room.findMany({ where: { deletedAt: null }, include: { branch: true }, orderBy, skip: query.offset, take: query.limit })]);
	return success(items, 200, listMeta(query, items.length, total));
}
export async function POST({ locals, request }: import('./$types').RequestEvent) {
	const actor = requireAdminApi(locals.user); const data = input(await request.json().catch(() => null)); if (!data) return failure(400, 'INVALID_REQUEST', 'Invalid request.');
	try { const item = await getPrisma().$transaction(async tx => { if (!await tx.branch.count({ where: { id: data.branchId, deletedAt: null } })) throw new Error(); const created = await tx.room.create({ data }); await writeAuditLog(tx, actor.id, 'create', 'room', created.id); return created; }); return success(item, 201); } catch { return failure(400, 'INVALID_REQUEST', 'Invalid request.'); }
}
