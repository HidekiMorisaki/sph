import { Prisma } from '$lib/server/generated/prisma/client';
import { failure, type ApiErrorDetail } from '$lib/server/api/response';
import { ManagementCodeExhaustedError } from '$lib/server/api/it-asset-management-code';

export class ItAssetValidationError extends Error {
	constructor(readonly details: ApiErrorDetail[]) { super('Invalid IT asset input.'); }
}

export function itAssetErrorResponse(error: unknown) {
	if (error instanceof ItAssetValidationError) return failure(400, 'VALIDATION_ERROR', 'Invalid IT asset input.', error.details);
	if (error instanceof ManagementCodeExhaustedError) return failure(409, 'IT_ASSET_CODE_EXHAUSTED', 'No management codes remain for this type.', [{ field: 'assetTag', reason: 'No management codes remain for this type.' }]);
	if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') return null;
	const diagnostic = `${JSON.stringify(error.meta ?? {})} ${error.message}`;
	if (diagnostic.includes('asset_tag') || diagnostic.includes('assetTag')) return failure(409, 'IT_ASSET_FIELD_CONFLICT', 'An IT asset already uses this value.', [{ field: 'assetTag', reason: 'This management number is already in use.' }]);
	if ((diagnostic.includes('manufacturer_id') || diagnostic.includes('manufacturerId')) && (diagnostic.includes('serial_number') || diagnostic.includes('serialNumber'))) return failure(409, 'IT_ASSET_FIELD_CONFLICT', 'An IT asset already uses this value.', [{ field: 'serialNumber', reason: 'This serial number is already in use for the selected manufacturer.' }]);
	return failure(409, 'IT_ASSET_FIELD_CONFLICT', 'An IT asset already uses this value.');
}
