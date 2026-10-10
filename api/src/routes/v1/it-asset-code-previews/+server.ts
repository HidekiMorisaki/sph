import { requireScopedOperationApi } from '$lib/server/api/branch-access';
import { permissionOperations } from '$lib/server/auth/permissions';
import { ManagementCodeExhaustedError, formatManagementCode } from '$lib/server/api/it-asset-management-code';
import { itAssetErrorResponse } from '$lib/server/api/it-asset-errors';
import { failure, success } from '$lib/server/api/response';
import { getPrisma } from '$lib/server/prisma';

export async function GET({ locals, url }: import('./$types').RequestEvent) {
	requireScopedOperationApi(locals.user, permissionOperations.assetManagement);
	const raw = url.searchParams.get('typeId');
	const typeId = raw && /^\d+$/.test(raw) ? Number(raw) : NaN;
	if (!Number.isSafeInteger(typeId) || typeId < 1) return failure(400, 'VALIDATION_ERROR', 'Select a valid type.', [{ field: 'typeId', reason: 'Select a valid type.' }]);
	const prisma = getPrisma();
	const type = await prisma.itAssetType.findFirst({ where: { id: typeId, deletedAt: null }, select: { managementCodePrefix: true, nextManagementNumber: true } });
	if (!type) return failure(400, 'VALIDATION_ERROR', 'Select an existing type.', [{ field: 'typeId', reason: 'Select an existing type.' }]);
	const reserved = new Set((await prisma.itAssetManagementCode.findMany({
		where: { code: { startsWith: `${type.managementCodePrefix}-` } },
		select: { code: true }
	})).map((item) => item.code));
	for (let number = type.nextManagementNumber; number <= 999; number += 1) {
		const assetTag = formatManagementCode(type.managementCodePrefix, number);
		if (!reserved.has(assetTag)) return success({ assetTag });
	}
	return itAssetErrorResponse(new ManagementCodeExhaustedError())!;
}
