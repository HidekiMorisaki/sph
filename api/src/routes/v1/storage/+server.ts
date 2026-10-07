import { requireMasterManagementApi, requireOperationApi, writeAuditLog } from '$lib/server/api/admin';
import { permissionOperations } from '$lib/server/auth/permissions';
import { readMasterSnapshot, recordMasterChange } from '$lib/server/api/master-history';
import { listMeta, parseListQuery, parseSearch } from '$lib/server/api/query';
import { failure, success } from '$lib/server/api/response';
import type { Prisma } from '$lib/server/generated/prisma/client';
import { getPrisma } from '$lib/server/prisma';
import { duplicateField } from '$lib/server/api/database';

function input(value: unknown): { name: string; notes: string | null; branchId: number; roomId: number; sortOrder?: number } | null {
	if (!value || typeof value !== 'object') return null;
	const { name, notes, branchId, roomId } = value as Record<string, unknown>;
	if (typeof name !== 'string' || (notes !== undefined && notes !== null && typeof notes !== 'string')) return null;
	const parseId = (raw: unknown) => typeof raw === 'number' ? raw : typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) : 0;
	const rawSortOrder = (value as Record<string, unknown>).sortOrder;
	const sortOrder = rawSortOrder === undefined ? undefined : typeof rawSortOrder === 'number' ? rawSortOrder : typeof rawSortOrder === 'string' && /^\d+$/.test(rawSortOrder) ? Number(rawSortOrder) : NaN;
	const result = { name: name.trim(), notes: typeof notes === 'string' && notes.trim() ? notes.trim() : null, branchId: parseId(branchId), roomId: parseId(roomId), ...(sortOrder === undefined ? {} : { sortOrder }) };
	return result.name && result.name.length <= 128 && result.branchId > 0 && result.roomId > 0 && (!result.notes || result.notes.length <= 5000) && (sortOrder === undefined || Number.isSafeInteger(sortOrder) && sortOrder >= 0) ? result : null;
}

const sortFields = ['id', 'name', 'branch', 'room', 'sortOrder', 'notes', 'createdAt', 'updatedAt'] as const;

export async function GET({ locals, url }: import('./$types').RequestEvent) {
	requireOperationApi(locals.user, permissionOperations.masterRead);
	const query = parseListQuery(url, sortFields, 'sortOrder');
	const search = parseSearch(url);
	const where: Prisma.StorageWhereInput = { deletedAt: null, ...(search ? { OR: [{ name: { contains: search, mode: 'insensitive' } }, { notes: { contains: search, mode: 'insensitive' } }, { room: { is: { name: { contains: search, mode: 'insensitive' }, deletedAt: null } } }, { room: { is: { branch: { is: { name: { contains: search, mode: 'insensitive' }, deletedAt: null } } } } }] } : {}) };
	const first = query.sortBy === 'branch' ? { room: { branch: { name: query.sortOrder } } } : query.sortBy === 'room' ? { room: { name: query.sortOrder } } : { [query.sortBy]: query.sortOrder };
	const orderBy = [first, ...(query.sortBy === 'id' ? [] : [{ id: 'asc' as const }])] as Prisma.StorageOrderByWithRelationInput[];
	const db = getPrisma();
	const [total, items] = await db.$transaction([
		db.storage.count({ where }),
		db.storage.findMany({ where, include: { room: { include: { branch: true } }, _count: { select: { itAssets: { where: { deletedAt: null } } } } }, orderBy, skip: query.offset, take: query.limit })
	]);
	const data = items.map(({ _count, ...item }) => ({ ...item, usageCount: _count.itAssets }));
	return success(data, 200, listMeta(query, data.length, total));
}

export async function POST({ request, locals }: import('./$types').RequestEvent) {
	const actor = requireMasterManagementApi(locals.user); const value = input(await request.json().catch(() => null));
	if (!value) return failure(400, 'INVALID_REQUEST', 'Invalid request.');
	try {
		const item = await getPrisma().$transaction(async (tx) => {
			if (!await tx.room.count({ where: { id: value.roomId, branchId: value.branchId, deletedAt: null, branch: { deletedAt: null } } })) throw new Error('inactive room');
			const created = await tx.storage.create({ data: value }); await writeAuditLog(tx, actor.id, 'create', 'storage', created.id); await recordMasterChange(tx, 'storage', created.id, actor.id, 'create', null, await readMasterSnapshot(tx, 'storage', created.id)); return created;
		});
		return success(item, 201);
	} catch (error) { const field = duplicateField(error); return field ? failure(409, 'DUPLICATE_VALUE', 'This value already exists.', [{ field, reason: 'DUPLICATE_VALUE' }]) : failure(400, 'INVALID_REQUEST', 'Invalid request.'); }
}
