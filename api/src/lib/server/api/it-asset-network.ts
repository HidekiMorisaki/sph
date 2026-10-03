import { isIP } from 'node:net';
import type { Prisma } from '$lib/server/generated/prisma/client';
import { ItAssetValidationError } from './it-asset-errors';

export type AssetIpAddresses = { ipAddress1: string | null; ipAddress2: string | null };

function canonicalIpAddress(value: string): string | null {
	const version = isIP(value);
	if (version === 4) return value.split('.').map((part) => String(Number(part))).join('.');
	if (version === 6) {
		const hostname = new URL(`http://[${value}]/`).hostname;
		return hostname.slice(1, -1).toLowerCase();
	}
	return null;
}

export function parseIpAddress(value: unknown, field: keyof AssetIpAddresses): { value: string | null; error?: { field: string; reason: string } } {
	if (value === null || value === undefined || value === '') return { value: null };
	if (typeof value !== 'string') return { value: null, error: { field, reason: 'Enter a valid IPv4 or IPv6 address.' } };
	const normalized = canonicalIpAddress(value.trim());
	return normalized ? { value: normalized } : { value: null, error: { field, reason: 'Enter a valid IPv4 or IPv6 address.' } };
}

export async function syncAssetIpAddresses(tx: Prisma.TransactionClient, assetId: number, storageId: number, addresses: AssetIpAddresses): Promise<void> {
	const storage = await tx.storage.findFirst({ where: { id: storageId, deletedAt: null, room: { deletedAt: null, branch: { deletedAt: null } } }, select: { roomId: true } });
	if (!storage) throw new ItAssetValidationError([{ field: 'storageId', reason: 'Select an existing storage.' }]);
	const now = new Date();
	await tx.itAssetIpAddress.updateMany({ where: { assetId, deletedAt: null }, data: { deletedAt: now } });
	for (const slot of [1, 2] as const) {
		const ipAddress = addresses[`ipAddress${slot}`];
		if (!ipAddress) continue;
		await tx.itAssetIpAddress.upsert({
			where: { assetId_slot: { assetId, slot } },
			create: { assetId, slot, roomId: storage.roomId, ipAddress },
			update: { roomId: storage.roomId, ipAddress, deletedAt: null }
		});
	}
}

export async function softDeleteAssetIpAddresses(tx: Prisma.TransactionClient, assetId: number): Promise<void> {
	await tx.itAssetIpAddress.updateMany({ where: { assetId, deletedAt: null }, data: { deletedAt: new Date() } });
}
