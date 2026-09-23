import { requireAdminApi, requireAuthenticatedApi, writeAuditLog } from '$lib/server/api/admin';
import { listMeta, parseListQuery } from '$lib/server/api/query';
import { failure, success } from '$lib/server/api/response';
import type { Prisma } from '$lib/server/generated/prisma/client';
import { getPrisma } from '$lib/server/prisma';

function input(value: unknown): { code: string; name: string; kind: string | null; roomId: number } | null {
	if (!value || typeof value !== 'object') return null;
	const { code, name, kind, roomId } = value as Record<string, unknown>;
	if (typeof code !== 'string' || typeof name !== 'string') return null;
	const parsedRoomId = typeof roomId === 'number' ? roomId : typeof roomId === 'string' && /^\d+$/.test(roomId) ? Number(roomId) : 0;
	const result = { code: code.trim(), name: name.trim(), kind: typeof kind === 'string' && kind.trim() ? kind.trim() : null, roomId: parsedRoomId };
	return result.code && result.name && result.roomId > 0 && result.code.length <= 64 && result.name.length <= 128 ? result : null;
}

const sortFields = ['id', 'code', 'name', 'createdAt', 'updatedAt'] as const;

export async function GET({ locals, url }: import('./$types').RequestEvent) {
	requireAuthenticatedApi(locals.user);
	const query = parseListQuery(url, sortFields, 'code');
	const orderBy = [{ [query.sortBy]: query.sortOrder }, ...(query.sortBy === 'id' ? [] : [{ id: 'asc' as const }])] as Prisma.StorageLocationOrderByWithRelationInput[];
	const [total, items] = await getPrisma().$transaction([
		getPrisma().storageLocation.count({ where: { deletedAt: null } }),
		getPrisma().storageLocation.findMany({ where: { deletedAt: null }, include: { room: { include: { branch: true } } }, orderBy, skip: query.offset, take: query.limit })
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
	} catch { return failure(400, 'INVALID_REQUEST', 'Invalid request.'); }
}
