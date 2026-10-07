import { requireMasterManagementApi, requireOperationApi, writeAuditLog } from '$lib/server/api/admin';
import { permissionOperations } from '$lib/server/auth/permissions';
import { readMasterSnapshot, recordMasterChange } from '$lib/server/api/master-history';
import { listMeta, parseListQuery, parseSearch } from '$lib/server/api/query';
import { failure, success } from '$lib/server/api/response';
import type { Prisma } from '$lib/server/generated/prisma/client';
import { getPrisma } from '$lib/server/prisma';
import { duplicateField } from '$lib/server/api/database';

const sortFields = ['id', 'name', 'branch', 'sortOrder', 'notes', 'createdAt', 'updatedAt'] as const;
function input(value: unknown) {
	if (!value || typeof value !== 'object') return null; const body = value as Record<string, unknown>;
	const name = typeof body.name === 'string' ? body.name.trim() : '';
	const branchId = typeof body.branchId === 'number' ? body.branchId : typeof body.branchId === 'string' && /^\d+$/.test(body.branchId) ? Number(body.branchId) : 0;
	if (body.notes !== undefined && body.notes !== null && typeof body.notes !== 'string') return null;
	const notes = typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim() : null;
	const rawSortOrder = body.sortOrder;
	const sortOrder = rawSortOrder === undefined ? undefined : typeof rawSortOrder === 'number' ? rawSortOrder : typeof rawSortOrder === 'string' && /^\d+$/.test(rawSortOrder) ? Number(rawSortOrder) : NaN;
	return name && name.length <= 128 && branchId > 0 && (!notes || notes.length <= 5000) && (sortOrder === undefined || Number.isSafeInteger(sortOrder) && sortOrder >= 0) ? { name, branchId, notes, ...(sortOrder === undefined ? {} : { sortOrder }) } : null;
}
export async function GET({ locals, url }: import('./$types').RequestEvent) {
	requireOperationApi(locals.user, permissionOperations.masterRead); const query = parseListQuery(url, sortFields, 'sortOrder');
	const search = parseSearch(url);
	const where: Prisma.RoomWhereInput = { deletedAt: null, ...(search ? { OR: [{ name: { contains: search, mode: 'insensitive' } }, { notes: { contains: search, mode: 'insensitive' } }, { branch: { is: { name: { contains: search, mode: 'insensitive' }, deletedAt: null } } }] } : {}) };
	const orderBy = [query.sortBy === 'branch' ? { branch: { name: query.sortOrder } } : { [query.sortBy]: query.sortOrder }, { id: 'asc' as const }] as Prisma.RoomOrderByWithRelationInput[];
	const [total, items] = await getPrisma().$transaction([getPrisma().room.count({ where }), getPrisma().room.findMany({ where, include: { branch: true, _count: { select: { storage: { where: { deletedAt: null } } } } }, orderBy, skip: query.offset, take: query.limit })]);
	const data = items.map(({ _count, ...item }) => ({ ...item, usageCount: _count.storage }));
	return success(data, 200, listMeta(query, data.length, total));
}
export async function POST({ locals, request }: import('./$types').RequestEvent) {
	const actor = requireMasterManagementApi(locals.user); const data = input(await request.json().catch(() => null)); if (!data) return failure(400, 'INVALID_REQUEST', 'Invalid request.');
	try { const item = await getPrisma().$transaction(async tx => { if (!await tx.branch.count({ where: { id: data.branchId, deletedAt: null } })) throw new Error(); const created = await tx.room.create({ data }); await writeAuditLog(tx, actor.id, 'create', 'room', created.id); await recordMasterChange(tx, 'room', created.id, actor.id, 'create', null, await readMasterSnapshot(tx, 'room', created.id)); return created; }); return success(item, 201); } catch (error) { const field=duplicateField(error);return field?failure(409,'DUPLICATE_VALUE','This value already exists.',[{field,reason:'DUPLICATE_VALUE'}]):failure(400, 'INVALID_REQUEST', 'Invalid request.'); }
}
