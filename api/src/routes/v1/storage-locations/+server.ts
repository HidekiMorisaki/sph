import { requireAdminApi, requireAuthenticatedApi, writeAuditLog } from '$lib/server/api/admin';
import { listMeta, parseListQuery, parseSearch } from '$lib/server/api/query';
import { failure, success } from '$lib/server/api/response';
import type { Prisma } from '$lib/server/generated/prisma/client';
import { getPrisma } from '$lib/server/prisma';
import { duplicateField } from '$lib/server/api/database';

function input(value: unknown): { code: string; name: string; notes: string | null; roomId: number } | null {
	if (!value || typeof value !== 'object') return null;
	const { code, name, notes, roomId } = value as Record<string, unknown>;
	if (typeof code !== 'string' || typeof name !== 'string') return null;
	if (notes !== undefined && notes !== null && typeof notes !== 'string') return null;
	const parsedRoomId = typeof roomId === 'number' ? roomId : typeof roomId === 'string' && /^\d+$/.test(roomId) ? Number(roomId) : 0;
	const result = { code: code.trim(), name: name.trim(), notes: typeof notes === 'string' && notes.trim() ? notes.trim() : null, roomId: parsedRoomId };
	return result.code && result.name && result.roomId > 0 && result.code.length <= 64 && result.name.length <= 128 && (!result.notes || result.notes.length <= 5000) ? result : null;
}

const sortFields = ['id', 'code', 'name', 'branch', 'room', 'notes', 'createdAt', 'updatedAt'] as const;

export async function GET({ locals, url }: import('./$types').RequestEvent) {
	requireAuthenticatedApi(locals.user);
	const query = parseListQuery(url, sortFields, 'code');
	const search = parseSearch(url);
	const where: Prisma.StorageLocationWhereInput = { deletedAt: null, ...(search ? { OR: [{ code: { contains: search, mode: 'insensitive' } }, { name: { contains: search, mode: 'insensitive' } }, { notes: { contains: search, mode: 'insensitive' } }, { room: { is: { name: { contains: search, mode: 'insensitive' }, deletedAt: null } } }, { room: { is: { branch: { is: { name: { contains: search, mode: 'insensitive' }, deletedAt: null } } } } }] } : {}) };
	const first = query.sortBy === 'branch' ? { room: { branch: { name: query.sortOrder } } } : query.sortBy === 'room' ? { room: { name: query.sortOrder } } : { [query.sortBy]: query.sortOrder };
	const orderBy = [first, ...(query.sortBy === 'id' ? [] : [{ id: 'asc' as const }])] as Prisma.StorageLocationOrderByWithRelationInput[];
	const [total, items] = await getPrisma().$transaction([
		getPrisma().storageLocation.count({ where }),
		getPrisma().storageLocation.findMany({ where, include: { room: { include: { branch: true } } }, orderBy, skip: query.offset, take: query.limit })
	]);
	return success(items, 200, listMeta(query, items.length, total));
}

export async function POST({ request, locals }: import('./$types').RequestEvent) {
	const actor = requireAdminApi(locals.user); const value = input(await request.json().catch(() => null));
	if (!value) return failure(400, 'INVALID_REQUEST', 'Invalid request.');
	try {
		const item = await getPrisma().$transaction(async (tx) => {
			if (!await tx.room.count({ where: { id: value.roomId, deletedAt: null, branch: { deletedAt: null } } })) throw new Error('inactive room');
			const created = await tx.storageLocation.create({ data: value }); await writeAuditLog(tx, actor.id, 'create', 'storage_location', created.id); return created;
		});
		return success(item, 201);
	} catch (error) { const field=duplicateField(error);return field?failure(409,'DUPLICATE_VALUE','This value already exists.',[{field,reason:'DUPLICATE_VALUE'}]):failure(400, 'INVALID_REQUEST', 'Invalid request.'); }
}
