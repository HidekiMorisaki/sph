import { requireAssetWriteApi, writeAuditLog } from '$lib/server/api/admin';
import { parseId } from '$lib/server/api/database';
import { readAssetFields, recordAssetChange } from '$lib/server/api/it-asset-history';
import { failure, success } from '$lib/server/api/response';
import { getPrisma } from '$lib/server/prisma';

export async function PATCH({ params, locals }: import('./$types').RequestEvent) {
	const actor = requireAssetWriteApi(locals.user); const assetId = parseId(params.id); const assignmentId = parseId(params.assignmentId); if (!assetId || !assignmentId) return failure(404, 'NOT_FOUND', 'Not found.');
	const item = await getPrisma().$transaction(async tx => { const locked = await tx.$queryRaw<Array<{ id: number }>>`SELECT id FROM it_assets WHERE id = ${assetId} AND deleted_at IS NULL FOR UPDATE`; if (!locked.length) return null; const before = await readAssetFields(tx, assetId); const returnedAt = new Date(); const changed = await tx.itAssetAssignment.updateMany({ where: { id: assignmentId, assetId, returnedAt: null, deletedAt: null }, data: { returnedAt } }); if (!changed.count) return null; await recordAssetChange(tx, assetId, actor.id, 'return', before, await readAssetFields(tx, assetId)); await writeAuditLog(tx, actor.id, 'return', 'it_asset_assignment', assignmentId); return { id: assignmentId, returnedAt }; }, { isolationLevel: 'ReadCommitted' });
	return item ? success(item) : failure(404, 'NOT_FOUND', 'Active assignment not found.');
}
