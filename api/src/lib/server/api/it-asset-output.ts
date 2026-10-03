import type { Prisma } from '$lib/server/generated/prisma/client';
import { itAssetInclude } from './it-asset-input';

type ItAssetRecord = Prisma.ItAssetGetPayload<{ include: typeof itAssetInclude }>;

export function itAssetOutput(record: ItAssetRecord) {
	const { ipAddresses, ...asset } = record;
	return {
		...asset,
		ipAddress1: ipAddresses.find((item) => item.slot === 1)?.ipAddress ?? null,
		ipAddress2: ipAddresses.find((item) => item.slot === 2)?.ipAddress ?? null
	};
}
