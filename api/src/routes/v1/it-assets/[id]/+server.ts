import { requireAssetWriteApi, requireAuthenticatedApi, writeAuditLog } from '$lib/server/api/admin';
import { parseId } from '$lib/server/api/database';
import { itAssetInclude, itAssetReferenceErrors, parseItAssetInput } from '$lib/server/api/it-asset-input';
import { allocateManagementCode } from '$lib/server/api/it-asset-management-code';
import { ItAssetValidationError, itAssetErrorResponse } from '$lib/server/api/it-asset-errors';
import { changeAssignee, readAssetFields, recordAssetChange } from '$lib/server/api/it-asset-history';
import { failure, success } from '$lib/server/api/response';
import { getPrisma } from '$lib/server/prisma';

export async function GET({ params, locals }: import('./$types').RequestEvent) { requireAuthenticatedApi(locals.user); const id = parseId(params.id); if (!id) return failure(404, 'NOT_FOUND', 'Not found.'); const item = await getPrisma().itAsset.findFirst({ where: { id, deletedAt: null }, include: itAssetInclude }); return item ? success(item) : failure(404, 'NOT_FOUND', 'Not found.'); }
export async function PATCH({ params, locals, request }: import('./$types').RequestEvent) {
	const actor = requireAssetWriteApi(locals.user);
	const id = parseId(params.id);
	if (!id) return failure(404, 'NOT_FOUND', 'Not found.');
	const parsed = parseItAssetInput(await request.json().catch(() => null));
	const data = parsed.data;
	if (!data) return failure(400, 'VALIDATION_ERROR', 'Invalid IT asset input.', parsed.details);
	try {
		const item = await getPrisma().$transaction(async tx => {
			await tx.$queryRaw`SELECT id FROM it_assets WHERE id = ${id} AND deleted_at IS NULL FOR UPDATE`;
			const existing = await tx.itAsset.findFirst({ where: { id, deletedAt: null }, select: { id: true, typeId: true, assetTag: true } });
			if (!existing) return null;
			const before = await readAssetFields(tx, id);
			const details = await itAssetReferenceErrors(tx, data);
			if (details.length) throw new ItAssetValidationError(details);
			const assetTag = existing.typeId === data.typeId ? existing.assetTag : await allocateManagementCode(tx, data.typeId);
			await tx.itAsset.update({ where: { id }, data: { ...data, assetTag } });
			await changeAssignee(tx, id, parsed.assigneeId, actor.id);
			await recordAssetChange(tx, id, actor.id, 'update', before, await readAssetFields(tx, id));
			await writeAuditLog(tx, actor.id, 'update', 'it_asset', id);
			return tx.itAsset.findUnique({ where: { id }, include: itAssetInclude });
		}, { isolationLevel: 'ReadCommitted' });
		return item ? success(item) : failure(404, 'NOT_FOUND', 'Not found.');
	} catch (error) {
		const response = itAssetErrorResponse(error);
		if (response) return response;
		throw error;
	}
}
export async function DELETE({ params, locals }: import('./$types').RequestEvent) {
	const actor = requireAssetWriteApi(locals.user); const id = parseId(params.id); if (!id) return failure(404, 'NOT_FOUND', 'Not found.'); const result = await getPrisma().$transaction(async tx => { const locked = await tx.$queryRaw<Array<{ id: number }>>`SELECT id FROM it_assets WHERE id = ${id} AND deleted_at IS NULL FOR UPDATE`; if (!locked.length) return 'not_found'; if (await tx.itAssetAssignment.count({ where: { assetId: id, returnedAt: null, deletedAt: null } })) return 'referenced'; const before = await readAssetFields(tx, id); await tx.itAsset.update({ where: { id }, data: { deletedAt: new Date() } }); await recordAssetChange(tx, id, actor.id, 'delete', before, null); await writeAuditLog(tx, actor.id, 'delete', 'it_asset', id); return 'deleted'; }, { isolationLevel: 'ReadCommitted' }); return result === 'referenced' ? failure(409, 'RESOURCE_IN_USE', 'The asset is currently assigned.') : result === 'not_found' ? failure(404, 'NOT_FOUND', 'Not found.') : success({ id, deleted: true });
}
