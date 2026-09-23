import { requireAuthenticatedApi } from '$lib/server/api/admin';
import { ManagementCodeExhaustedError, formatManagementCode } from '$lib/server/api/it-asset-management-code';
import { itAssetErrorResponse } from '$lib/server/api/it-asset-errors';
import { failure, success } from '$lib/server/api/response';
import { getPrisma } from '$lib/server/prisma';

export async function GET({ locals, url }: import('./$types').RequestEvent) {
	requireAuthenticatedApi(locals.user);
	const raw = url.searchParams.get('typeId');
	const typeId = raw && /^\d+$/.test(raw) ? Number(raw) : NaN;
	if (!Number.isSafeInteger(typeId) || typeId < 1) return failure(400, 'VALIDATION_ERROR', 'Select a valid type.', [{ field: 'typeId', reason: 'Select a valid type.' }]);
	const type = await getPrisma().itAssetType.findFirst({ where: { id: typeId, deletedAt: null }, select: { managementCodePrefix: true, nextManagementNumber: true } });
	if (!type) return failure(400, 'VALIDATION_ERROR', 'Select an existing type.', [{ field: 'typeId', reason: 'Select an existing type.' }]);
	if (type.nextManagementNumber > 9999) return itAssetErrorResponse(new ManagementCodeExhaustedError())!;
	return success({ assetTag: formatManagementCode(type.managementCodePrefix, type.nextManagementNumber) });
}
