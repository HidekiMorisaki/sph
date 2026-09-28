import { requireAssetWriteApi, writeAuditLog } from '$lib/server/api/admin';
import { parseId } from '$lib/server/api/database';
import { readAssetFields, recordAssetChange } from '$lib/server/api/it-asset-history';
import { failure, success } from '$lib/server/api/response';
import { getPrisma } from '$lib/server/prisma';

export async function GET({ params, locals }: import('./$types').RequestEvent) {
	requireAssetWriteApi(locals.user); const assetId = parseId(params.id); if (!assetId) return failure(404, 'NOT_FOUND', 'Not found.');
	return success(await getPrisma().itAssetAssignment.findMany({ where: { assetId, deletedAt: null, asset: { deletedAt: null } }, include: { employee: { select: { id: true, employeeCode: true, firstName: true, lastName: true } } }, orderBy: { assignedAt: 'desc' } }));
}
export async function POST({ params, locals, request }: import('./$types').RequestEvent) {
	const actor = requireAssetWriteApi(locals.user); const assetId = parseId(params.id); const body = await request.json().catch(() => null) as Record<string, unknown> | null; const raw = body?.employeeId; const employeeId = typeof raw === 'number' ? raw : typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) : 0;
	if (!assetId || !employeeId) return failure(400, 'INVALID_REQUEST', 'Invalid request.');
	try { const item = await getPrisma().$transaction(async tx => { const locked = await tx.$queryRaw<Array<{ id: number }>>`SELECT id FROM it_assets WHERE id = ${assetId} AND deleted_at IS NULL FOR UPDATE`; if (!locked.length || !await tx.employee.count({ where: { id: employeeId, deletedAt: null, OR: [{ retiredAt: null }, { retiredAt: { gt: new Date() } }] } }) || await tx.itAssetAssignment.count({ where: { assetId, returnedAt: null, deletedAt: null } })) throw new Error(); const before = await readAssetFields(tx, assetId); const created = await tx.itAssetAssignment.create({ data: { assetId, employeeId } }); await recordAssetChange(tx, assetId, actor.id, 'assign', before, await readAssetFields(tx, assetId)); await writeAuditLog(tx, actor.id, 'assign', 'it_asset_assignment', created.id); return created; }, { isolationLevel: 'ReadCommitted' }); return success(item, 201); } catch { return failure(409, 'ASSIGNMENT_CONFLICT', 'The asset cannot be assigned.'); }
}
