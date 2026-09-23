import type { Prisma } from '$lib/server/generated/prisma/client';

export class ManagementCodeExhaustedError extends Error {
	constructor() { super('No management codes remain for this type.'); }
}

export function formatManagementCode(prefix: string, number: number) {
	return `${prefix}-${String(number).padStart(4, '0')}`;
}

export async function allocateManagementCode(tx: Prisma.TransactionClient, typeId: number) {
	const rows = await tx.$queryRaw<Array<{ management_code_prefix: string; next_management_number: number }>>`
		UPDATE it_asset_types
		SET next_management_number = next_management_number + 1
		WHERE id = ${typeId} AND deleted_at IS NULL AND next_management_number <= 9999
		RETURNING management_code_prefix, next_management_number
	`;
	if (!rows[0]) throw new ManagementCodeExhaustedError();
	return formatManagementCode(rows[0].management_code_prefix, rows[0].next_management_number - 1);
}
