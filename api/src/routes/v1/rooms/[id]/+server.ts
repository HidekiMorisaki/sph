import { requireAdminApi, writeAuditLog } from '$lib/server/api/admin';
import { duplicateField, parseId } from '$lib/server/api/database';
import { failure, success } from '$lib/server/api/response';
import { getPrisma } from '$lib/server/prisma';

function input(value: unknown) {
	if (!value || typeof value !== 'object') return null; const body = value as Record<string, unknown>;
	const code = typeof body.code === 'string' ? body.code.trim() : ''; const name = typeof body.name === 'string' ? body.name.trim() : '';
	const branchId = typeof body.branchId === 'number' ? body.branchId : typeof body.branchId === 'string' && /^\d+$/.test(body.branchId) ? Number(body.branchId) : 0;
	return code && name && branchId > 0 ? { code, name, branchId, floor: typeof body.floor === 'string' && body.floor.trim() ? body.floor.trim() : null } : null;
}
export async function PATCH({ params, locals, request }: import('./$types').RequestEvent) {
	const actor = requireAdminApi(locals.user); const id = parseId(params.id); const data = input(await request.json().catch(() => null)); if (!id || !data) return failure(400, 'INVALID_REQUEST', 'Invalid request.');
	try { const item = await getPrisma().$transaction(async tx => { if (!await tx.branch.count({ where: { id: data.branchId, deletedAt: null } })) return null; const changed = await tx.room.updateMany({ where: { id, deletedAt: null }, data }); if (!changed.count) return null; await writeAuditLog(tx, actor.id, 'update', 'room', id); return { id, ...data }; }); return item ? success(item) : failure(404, 'NOT_FOUND', 'Not found.'); } catch (error) { const field=duplicateField(error);return field?failure(409,'DUPLICATE_VALUE','This value already exists.',[{field,reason:'DUPLICATE_VALUE'}]):failure(400, 'INVALID_REQUEST', 'Invalid request.'); }
}
export async function DELETE({ params, locals }: import('./$types').RequestEvent) {
	const actor = requireAdminApi(locals.user); const id = parseId(params.id); if (!id) return failure(404, 'NOT_FOUND', 'Not found.');
	const result = await getPrisma().$transaction(async tx => { if (await tx.storageLocation.count({ where: { roomId: id, deletedAt: null } })) return 'referenced'; const changed = await tx.room.updateMany({ where: { id, deletedAt: null }, data: { deletedAt: new Date() } }); if (!changed.count) return 'not_found'; await writeAuditLog(tx, actor.id, 'delete', 'room', id); return 'deleted'; });
	return result === 'referenced' ? failure(409, 'RESOURCE_IN_USE', 'The room is still referenced.') : result === 'not_found' ? failure(404, 'NOT_FOUND', 'Not found.') : success({ id, deleted: true });
}
