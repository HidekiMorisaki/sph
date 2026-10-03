import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { env } from '$env/dynamic/private';
import type { Prisma } from '$lib/server/generated/prisma/client';
import type { ApiErrorDetail } from './response';
import { writeAuditLog } from './admin';

export const ASSET_CREDENTIAL_TYPES = ['admin', 'login', 'management_console'] as const;
export type AssetCredentialType = (typeof ASSET_CREDENTIAL_TYPES)[number];
export type AssetCredentialChange = { action: 'set'; password: string } | { action: 'clear' };
export type AssetCredentialChanges = Partial<Record<AssetCredentialType, AssetCredentialChange>>;

export function isAssetCredentialType(value: string): value is AssetCredentialType {
	return ASSET_CREDENTIAL_TYPES.some((type) => type === value);
}

function encryptionKey(): Buffer {
	const configured = env.IT_ASSET_CREDENTIAL_ENCRYPTION_KEY;
	if (!configured) throw new Error('IT_ASSET_CREDENTIAL_ENCRYPTION_KEY must be configured.');
	const key = Buffer.from(configured, 'base64url');
	if (key.length !== 32 || key.toString('base64url') !== configured) throw new Error('IT_ASSET_CREDENTIAL_ENCRYPTION_KEY must be a canonical base64url-encoded 32-byte key.');
	return key;
}

export function validateCredentialEncryptionConfiguration(): void {
	void encryptionKey();
}

function additionalData(assetId: number, credentialType: AssetCredentialType, keyVersion: number): Buffer {
	return Buffer.from(`sph:it-asset:${assetId}:${credentialType}:v${keyVersion}`, 'utf8');
}

function encryptPassword(assetId: number, credentialType: AssetCredentialType, password: string) {
	const keyVersion = 1;
	const initializationVector = randomBytes(12);
	const cipher = createCipheriv('aes-256-gcm', encryptionKey(), initializationVector);
	cipher.setAAD(additionalData(assetId, credentialType, keyVersion));
	const ciphertext = Buffer.concat([cipher.update(password, 'utf8'), cipher.final()]);
	return {
		ciphertext: ciphertext.toString('base64url'),
		initializationVector: initializationVector.toString('base64url'),
		authenticationTag: cipher.getAuthTag().toString('base64url'),
		keyVersion
	};
}

export function decryptPassword(record: { assetId: number; credentialType: string; ciphertext: string; initializationVector: string; authenticationTag: string; keyVersion: number }): string {
	if (!isAssetCredentialType(record.credentialType)) throw new Error('Unsupported asset credential type.');
	const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(record.initializationVector, 'base64url'));
	decipher.setAAD(additionalData(record.assetId, record.credentialType, record.keyVersion));
	decipher.setAuthTag(Buffer.from(record.authenticationTag, 'base64url'));
	return Buffer.concat([decipher.update(Buffer.from(record.ciphertext, 'base64url')), decipher.final()]).toString('utf8');
}

export function parseCredentialChanges(value: unknown): { changes: AssetCredentialChanges; details: ApiErrorDetail[] } {
	if (value === undefined) return { changes: {}, details: [] };
	if (!value || typeof value !== 'object' || Array.isArray(value)) return { changes: {}, details: [{ field: 'credentials', reason: 'Enter valid credential changes.' }] };
	const changes: AssetCredentialChanges = {};
	const details: ApiErrorDetail[] = [];
	for (const [type, raw] of Object.entries(value as Record<string, unknown>)) {
		if (!isAssetCredentialType(type)) { details.push({ field: `credentials.${type}`, reason: 'Select a valid credential type.' }); continue; }
		if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { details.push({ field: `credentials.${type}`, reason: 'Enter a valid credential change.' }); continue; }
		const action = (raw as Record<string, unknown>).action;
		if (action === 'clear') { changes[type] = { action }; continue; }
		const password = (raw as Record<string, unknown>).password;
		if (action !== 'set' || typeof password !== 'string' || password.length === 0 || password.length > 1024) {
			details.push({ field: `credentials.${type}`, reason: 'Enter a password between 1 and 1024 characters, or clear the credential.' });
			continue;
		}
		changes[type] = { action, password };
	}
	return { changes, details };
}

export async function applyCredentialChanges(tx: Prisma.TransactionClient, assetId: number, actorId: number, changes: AssetCredentialChanges): Promise<void> {
	for (const [type, change] of Object.entries(changes) as Array<[AssetCredentialType, AssetCredentialChange]>) {
		if (change.action === 'clear') {
			const result = await tx.itAssetCredential.updateMany({ where: { assetId, credentialType: type, deletedAt: null }, data: { deletedAt: new Date() } });
			if (result.count) await writeAuditLog(tx, actorId, 'clear_credential', 'it_asset', assetId, { credentialType: type });
			continue;
		}
		const encrypted = encryptPassword(assetId, type, change.password);
		await tx.itAssetCredential.upsert({
			where: { assetId_credentialType: { assetId, credentialType: type } },
			create: { assetId, credentialType: type, ...encrypted },
			update: { ...encrypted, deletedAt: null }
		});
		await writeAuditLog(tx, actorId, 'set_credential', 'it_asset', assetId, { credentialType: type });
	}
}

export async function softDeleteAssetCredentials(tx: Prisma.TransactionClient, assetId: number, actorId: number): Promise<void> {
	const active = await tx.itAssetCredential.findMany({ where: { assetId, deletedAt: null }, select: { credentialType: true } });
	if (!active.length) return;
	await tx.itAssetCredential.updateMany({ where: { assetId, deletedAt: null }, data: { deletedAt: new Date() } });
	for (const item of active) await writeAuditLog(tx, actorId, 'clear_credential', 'it_asset', assetId, { credentialType: item.credentialType, reason: 'asset_deleted' });
}
