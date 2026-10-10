import { writeAuditLog } from '$lib/server/api/admin';
import { requireLocationManagementApi } from '$lib/server/api/branch-access';
import { readMasterSnapshot, recordMasterChange } from '$lib/server/api/master-history';
import { duplicateField, parseId } from '$lib/server/api/database';
import { failure, success } from '$lib/server/api/response';
import { getPrisma } from '$lib/server/prisma';

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
export async function PATCH({ params, locals, request }: import('./$types').RequestEvent) {
	const { actor, branchId } = requireLocationManagementApi(locals.user); const id = parseId(params.id); const data = input(await request.json().catch(() => null)); if (!id || !data) return failure(400, 'INVALID_REQUEST', 'Invalid request.');
	if (branchId !== null && data.branchId !== branchId) return failure(403, 'BRANCH_ACCESS_DENIED', 'Branch access is required.');
	try { const item = await getPrisma().$transaction(async tx => { if (!await tx.branch.count({ where: { id: data.branchId, deletedAt: null } })) return null; if (branchId !== null && !await tx.room.count({ where: { id, branchId, deletedAt: null } })) return null; const before = await readMasterSnapshot(tx, 'room', id); const changed = await tx.room.updateMany({ where: { id, deletedAt: null, ...(branchId === null ? {} : { branchId }) }, data }); if (!changed.count) return null; await writeAuditLog(tx, actor.id, 'update', 'room', id); await recordMasterChange(tx, 'room', id, actor.id, 'update', before, await readMasterSnapshot(tx, 'room', id)); return { id, ...data }; }); return item ? success(item) : failure(404, 'NOT_FOUND', 'Not found.'); } catch (error) { const field=duplicateField(error);return field?failure(409,'DUPLICATE_VALUE','This value already exists.',[{field,reason:'DUPLICATE_VALUE'}]):failure(400, 'INVALID_REQUEST', 'Invalid request.'); }
}
export async function DELETE({ params, locals }: import('./$types').RequestEvent) {
	const { actor, branchId } = requireLocationManagementApi(locals.user); const id = parseId(params.id); if (!id) return failure(404, 'NOT_FOUND', 'Not found.');
	const result = await getPrisma().$transaction(async tx => { if (!await tx.room.count({ where: { id, deletedAt: null, ...(branchId === null ? {} : { branchId }) } })) return 'not_found'; if (await tx.storage.count({ where: { roomId: id, deletedAt: null } })) return 'referenced'; const before = await readMasterSnapshot(tx, 'room', id); const changed = await tx.room.updateMany({ where: { id, deletedAt: null, ...(branchId === null ? {} : { branchId }) }, data: { deletedAt: new Date() } }); if (!changed.count) return 'not_found'; await writeAuditLog(tx, actor.id, 'delete', 'room', id); await recordMasterChange(tx, 'room', id, actor.id, 'delete', before, null); return 'deleted'; });
	return result === 'referenced' ? failure(409, 'RESOURCE_IN_USE', 'The room is still referenced.') : result === 'not_found' ? failure(404, 'NOT_FOUND', 'Not found.') : success({ id, deleted: true });
}
