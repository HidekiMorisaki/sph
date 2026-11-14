import { assetList } from '#lib/server/api/it-asset-list.js';
import { itAssetOutput } from '#lib/server/api/it-asset-output.js';
import { lockEmployeeAllocation } from '#lib/server/api/employee-availability.js';
import { writeAuditLog } from '#lib/server/api/admin.js';
import { requireScopedOperationApi } from '#lib/server/api/branch-access.js';
import { permissionOperations } from '#lib/server/auth/permissions.js';
import { authorizeCredentialChange, applyCredentialChanges, parseCredentialChanges } from '#lib/server/api/it-asset-credentials.js';
import { itAssetInclude, itAssetReferenceErrors, parseItAssetInput } from '#lib/server/api/it-asset-input.js';
import { reserveManagementCode, resolveManagementCode } from '#lib/server/api/it-asset-management-code.js';
import { ItAssetValidationError, itAssetErrorResponse } from '#lib/server/api/it-asset-errors.js';
import { changeAssignee, readAssetFields, recordAssetChange } from '#lib/server/api/it-asset-history.js';
import { syncAssetIpAddresses } from '#lib/server/api/it-asset-network.js';
import { failure, success } from '#lib/server/api/response.js';
import { getPrisma } from '#lib/server/prisma.js';

export async function GET({ locals, url }: import('./$types').RequestEvent) { return assetList(locals.user, url); }
export async function POST({ locals, request }: import('./$types').RequestEvent) {
	const { actor, branchId: branchScope } = requireScopedOperationApi(locals.user, permissionOperations.assetManagement);
	const body = await request.json().catch(() => null);
	const parsed = parseItAssetInput(body);
	const credentialInput = parseCredentialChanges(body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>).credentials : undefined);
	if (Object.keys(credentialInput.changes).length) requireScopedOperationApi(locals.user, permissionOperations.assetCredentialWrite);
	const data = parsed.data;
	if (!data || credentialInput.details.length) return failure(400, 'VALIDATION_ERROR', 'Invalid IT asset input.', [...parsed.details, ...credentialInput.details]);
	try {
		const item = await getPrisma().$transaction(async tx => {
			if(typeof parsed.assigneeId === 'number') await lockEmployeeAllocation(tx,parsed.assigneeId);
			if (branchScope !== null && (!await tx.storage.count({ where: { id: data.storageId, branchId: branchScope, deletedAt: null } }) || typeof parsed.assigneeId === 'number' && !await tx.employee.count({ where: { id: parsed.assigneeId, branchId: branchScope, deletedAt: null } }))) return null;
			if (Object.keys(credentialInput.changes).length) await authorizeCredentialChange(tx, actor, null, data.storageId);
			const details = await itAssetReferenceErrors(tx, data);
			if (details.length) throw new ItAssetValidationError(details);
			const assetTag = await resolveManagementCode(tx, data.typeId, parsed.assetTag);
			const created = await tx.itAsset.create({ data: { ...data, assetTag } });
			await reserveManagementCode(tx, created.id, assetTag);
			await syncAssetIpAddresses(tx, created.id, data.storageId, parsed.ipAddresses);
			await applyCredentialChanges(tx, created.id, actor.id, credentialInput.changes);
			await changeAssignee(tx, created.id, parsed.assigneeId, actor.id);
			await recordAssetChange(tx, created.id, actor.id, 'create', null, await readAssetFields(tx, created.id));
			await writeAuditLog(tx, actor.id, 'create', 'it_asset', created.id);
			return tx.itAsset.findUniqueOrThrow({ where: { id: created.id }, include: itAssetInclude });
		}, { isolationLevel: 'ReadCommitted' });
		return item ? success(itAssetOutput(item), 201) : failure(403, 'BRANCH_ACCESS_DENIED', 'Branch access is required.');
	} catch (error) {
		const response = itAssetErrorResponse(error);
		if (response) return response;
		throw error;
	}
}
