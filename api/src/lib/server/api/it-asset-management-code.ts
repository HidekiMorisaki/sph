import type { Prisma } from '$lib/server/generated/prisma/client';

export class ManagementCodeExhaustedError extends Error {
	constructor() { super('No management codes remain for this type.'); }
}

export class ManagementCodeValidationError extends Error {
	constructor(readonly reason: string) { super(reason); }
}

export function formatManagementCode(prefix: string, number: number) {
	return `${prefix}-${String(number).padStart(3, '0')}`;
}

type ResolveOptions = { existingCode?: string };

export async function resolveManagementCode(tx: Prisma.TransactionClient, typeId: number, requestedCode: string | null, options: ResolveOptions = {}) {
	const rows = await tx.$queryRaw<Array<{ management_code_prefix: string; next_management_number: number }>>`
		SELECT management_code_prefix, next_management_number
		FROM it_asset_types
		WHERE id = ${typeId} AND deleted_at IS NULL
		FOR UPDATE
	`;
	const type = rows[0];
	if (!type) throw new ManagementCodeValidationError('Select an existing type.');
	const requiredPrefix = `${type.management_code_prefix}-`;
	if (requestedCode !== null) {
		if (!requestedCode.startsWith(requiredPrefix)) {
			throw new ManagementCodeValidationError(`Management code must start with the selected type prefix "${requiredPrefix}".`);
		}
		const unchangedLegacyCode = requestedCode === options.existingCode && new RegExp(`^${type.management_code_prefix}-[0-9]{4}$`).test(requestedCode);
		if (!new RegExp(`^${type.management_code_prefix}-[0-9]{3}$`).test(requestedCode) && !unchangedLegacyCode) {
			throw new ManagementCodeValidationError(`Enter ${requiredPrefix} followed by exactly 3 digits.`);
		}
		return requestedCode;
	}

	const reservedCodes = new Set((await tx.itAssetManagementCode.findMany({
		where: { code: { startsWith: requiredPrefix } },
		select: { code: true }
	})).map((item) => item.code));
	let number = type.next_management_number;
	while (number <= 999) {
		const candidate = formatManagementCode(type.management_code_prefix, number);
		number += 1;
		if (!reservedCodes.has(candidate)) {
			await tx.itAssetType.update({ where: { id: typeId }, data: { nextManagementNumber: number } });
			return candidate;
		}
	}
	if (type.next_management_number !== 1000) await tx.itAssetType.update({ where: { id: typeId }, data: { nextManagementNumber: 1000 } });
	throw new ManagementCodeExhaustedError();
}

export async function reserveManagementCode(tx: Prisma.TransactionClient, assetId: number, code: string) {
	await tx.itAssetManagementCode.create({ data: { assetId, code } });
}
