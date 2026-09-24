import { requireAdminApi, writeAuditLog } from '$lib/server/api/admin';
import { duplicateField, parseId } from '$lib/server/api/database';
import { getPrisma } from '$lib/server/prisma';
import { failure, success } from '$lib/server/api/response';

function input(value: unknown): { code: string; name: string; kind: string | null; roomId: number } | null {
	if (!value || typeof value !== 'object') return null; const { code, name, kind, roomId } = value as Record<string, unknown>;
	if (typeof code !== 'string' || typeof name !== 'string') return null; const parsedRoomId = typeof roomId === 'number' ? roomId : typeof roomId === 'string' && /^\d+$/.test(roomId) ? Number(roomId) : 0;
	const result = { code: code.trim(), name: name.trim(), kind: typeof kind === 'string' && kind.trim() ? kind.trim() : null, roomId: parsedRoomId };
	return result.code && result.name && result.roomId > 0 && result.code.length <= 64 && result.name.length <= 128 ? result : null;
}

export async function PATCH({ params, request, locals }: import('./$types').RequestEvent) {
	const actor = requireAdminApi(locals.user); const id = parseId(params.id); const data = input(await request.json().catch(() => null));
	if (!id || !data) return failure(400, 'INVALID_REQUEST', 'Invalid request.');
	try {
		const item = await getPrisma().$transaction(async (tx) => {
			if (!await tx.room.count({ where: { id: data.roomId, deletedAt: null, branch: { deletedAt: null } } })) return null;
			const changed = await tx.storageLocation.updateMany({ where: { id, deletedAt: null }, data }); if (!changed.count) return null;
			await writeAuditLog(tx, actor.id, 'update', 'storage_location', id); return { id, ...data };
		});
		return item ? success(item) : failure(404, 'NOT_FOUND', 'Not found.');
	} catch (error) { const field=duplicateField(error);return field?failure(409,'DUPLICATE_VALUE','This value already exists.',[{field,reason:'DUPLICATE_VALUE'}]):failure(400, 'INVALID_REQUEST', 'Invalid request.'); }
}

export async function DELETE({ params, locals }: import('./$types').RequestEvent) {
	const actor = requireAdminApi(locals.user); const id = parseId(params.id); if (!id) return failure(404, 'NOT_FOUND', 'Not found.');
	const result = await getPrisma().$transaction(async (tx) => {
		const references = await Promise.all([
			tx.desk.count({ where: { locationId: id, deletedAt: null } }), tx.itAsset.count({ where: { locationId: id, deletedAt: null } }), tx.chair.count({ where: { locationId: id, deletedAt: null } })
		]);
		if (references.some((count) => count > 0)) return 'referenced';
		const changed = await tx.storageLocation.updateMany({ where: { id, deletedAt: null }, data: { deletedAt: new Date() } }); if (!changed.count) return 'not_found';
		await writeAuditLog(tx, actor.id, 'delete', 'storage_location', id); return 'deleted';
	}, { isolationLevel: 'Serializable' });
	if (result === 'referenced') return failure(409, 'RESOURCE_IN_USE', 'The location is still referenced.');
	return result === 'deleted' ? success({ id, deleted: true }) : failure(404, 'NOT_FOUND', 'Not found.');
}
