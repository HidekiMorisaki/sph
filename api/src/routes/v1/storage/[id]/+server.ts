import { requireAdminApi, writeAuditLog } from '$lib/server/api/admin';
import { duplicateField, parseId } from '$lib/server/api/database';
import { getPrisma } from '$lib/server/prisma';
import { failure, success } from '$lib/server/api/response';

function input(value: unknown): { name: string; notes: string | null; branchId: number; roomId: number } | null {
	if (!value || typeof value !== 'object') return null;
	const { name, notes, branchId, roomId } = value as Record<string, unknown>;
	if (typeof name !== 'string' || (notes !== undefined && notes !== null && typeof notes !== 'string')) return null;
	const toId = (raw: unknown) => typeof raw === 'number' ? raw : typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) : 0;
	const result = { name: name.trim(), notes: typeof notes === 'string' && notes.trim() ? notes.trim() : null, branchId: toId(branchId), roomId: toId(roomId) };
	return result.name && result.name.length <= 128 && result.branchId > 0 && result.roomId > 0 && (!result.notes || result.notes.length <= 5000) ? result : null;
}

export async function PATCH({ params, request, locals }: import('./$types').RequestEvent) {
	const actor = requireAdminApi(locals.user); const id = parseId(params.id); const data = input(await request.json().catch(() => null));
	if (!id || !data) return failure(400, 'INVALID_REQUEST', 'Invalid request.');
	try {
		const item = await getPrisma().$transaction(async (tx) => {
			if (!await tx.room.count({ where: { id: data.roomId, branchId: data.branchId, deletedAt: null, branch: { deletedAt: null } } })) return null;
			const changed = await tx.storage.updateMany({ where: { id, deletedAt: null }, data }); if (!changed.count) return null;
			await writeAuditLog(tx, actor.id, 'update', 'storage', id); return { id, ...data };
		});
		return item ? success(item) : failure(404, 'NOT_FOUND', 'Not found.');
	} catch (error) { const field = duplicateField(error); return field ? failure(409, 'DUPLICATE_VALUE', 'This value already exists.', [{ field, reason: 'DUPLICATE_VALUE' }]) : failure(400, 'INVALID_REQUEST', 'Invalid request.'); }
}

export async function DELETE({ params, locals }: import('./$types').RequestEvent) {
	const actor = requireAdminApi(locals.user); const id = parseId(params.id); if (!id) return failure(404, 'NOT_FOUND', 'Not found.');
	const result = await getPrisma().$transaction(async (tx) => {
		if (await tx.itAsset.count({ where: { storageId: id, deletedAt: null } })) return 'referenced';
		const changed = await tx.storage.updateMany({ where: { id, deletedAt: null }, data: { deletedAt: new Date() } }); if (!changed.count) return 'not_found';
		await writeAuditLog(tx, actor.id, 'delete', 'storage', id); return 'deleted';
	}, { isolationLevel: 'Serializable' });
	if (result === 'referenced') return failure(409, 'RESOURCE_IN_USE', 'The storage is still referenced.');
	return result === 'deleted' ? success({ id, deleted: true }) : failure(404, 'NOT_FOUND', 'Not found.');
}
