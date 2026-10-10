import { writeAuditLog } from '$lib/server/api/admin';
import { requireLocationManagementApi } from '$lib/server/api/branch-access';
import { readMasterSnapshot, recordMasterChange } from '$lib/server/api/master-history';
import { duplicateField, parseId } from '$lib/server/api/database';
import { getPrisma } from '$lib/server/prisma';
import { failure, success } from '$lib/server/api/response';

function input(value: unknown): { name: string; notes: string | null; branchId: number; roomId: number; sortOrder?: number } | null {
	if (!value || typeof value !== 'object') return null;
	const { name, notes, branchId, roomId } = value as Record<string, unknown>;
	if (typeof name !== 'string' || (notes !== undefined && notes !== null && typeof notes !== 'string')) return null;
	const toId = (raw: unknown) => typeof raw === 'number' ? raw : typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) : 0;
	const rawSortOrder = (value as Record<string, unknown>).sortOrder;
	const sortOrder = rawSortOrder === undefined ? undefined : typeof rawSortOrder === 'number' ? rawSortOrder : typeof rawSortOrder === 'string' && /^\d+$/.test(rawSortOrder) ? Number(rawSortOrder) : NaN;
	const result = { name: name.trim(), notes: typeof notes === 'string' && notes.trim() ? notes.trim() : null, branchId: toId(branchId), roomId: toId(roomId), ...(sortOrder === undefined ? {} : { sortOrder }) };
	return result.name && result.name.length <= 128 && result.branchId > 0 && result.roomId > 0 && (!result.notes || result.notes.length <= 5000) && (sortOrder === undefined || Number.isSafeInteger(sortOrder) && sortOrder >= 0) ? result : null;
}

export async function PATCH({ params, request, locals }: import('./$types').RequestEvent) {
	const { actor, branchId } = requireLocationManagementApi(locals.user); const id = parseId(params.id); const data = input(await request.json().catch(() => null));
	if (!id || !data) return failure(400, 'INVALID_REQUEST', 'Invalid request.');
	if (branchId !== null && data.branchId !== branchId) return failure(403, 'BRANCH_ACCESS_DENIED', 'Branch access is required.');
	try {
		const item = await getPrisma().$transaction(async (tx) => {
			if (!await tx.room.count({ where: { id: data.roomId, branchId: data.branchId, deletedAt: null, branch: { deletedAt: null } } })) return null;
			if (branchId !== null && !await tx.storage.count({ where: { id, branchId, deletedAt: null } })) return null;
			const before = await readMasterSnapshot(tx, 'storage', id);
			const changed = await tx.storage.updateMany({ where: { id, deletedAt: null, ...(branchId === null ? {} : { branchId }) }, data }); if (!changed.count) return null;
			await writeAuditLog(tx, actor.id, 'update', 'storage', id); await recordMasterChange(tx, 'storage', id, actor.id, 'update', before, await readMasterSnapshot(tx, 'storage', id)); return { id, ...data };
		});
		return item ? success(item) : failure(404, 'NOT_FOUND', 'Not found.');
	} catch (error) { const field = duplicateField(error); return field ? failure(409, 'DUPLICATE_VALUE', 'This value already exists.', [{ field, reason: 'DUPLICATE_VALUE' }]) : failure(400, 'INVALID_REQUEST', 'Invalid request.'); }
}

export async function DELETE({ params, locals }: import('./$types').RequestEvent) {
	const { actor, branchId } = requireLocationManagementApi(locals.user); const id = parseId(params.id); if (!id) return failure(404, 'NOT_FOUND', 'Not found.');
	const result = await getPrisma().$transaction(async (tx) => {
		if (!await tx.storage.count({ where: { id, deletedAt: null, ...(branchId === null ? {} : { branchId }) } })) return 'not_found';
		if (await tx.itAsset.count({ where: { storageId: id, deletedAt: null } })) return 'referenced';
		const before = await readMasterSnapshot(tx, 'storage', id);
		const changed = await tx.storage.updateMany({ where: { id, deletedAt: null, ...(branchId === null ? {} : { branchId }) }, data: { deletedAt: new Date() } }); if (!changed.count) return 'not_found';
		await writeAuditLog(tx, actor.id, 'delete', 'storage', id); await recordMasterChange(tx, 'storage', id, actor.id, 'delete', before, null); return 'deleted';
	}, { isolationLevel: 'Serializable' });
	if (result === 'referenced') return failure(409, 'RESOURCE_IN_USE', 'The storage is still referenced.');
	return result === 'deleted' ? success({ id, deleted: true }) : failure(404, 'NOT_FOUND', 'Not found.');
}
