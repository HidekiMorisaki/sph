import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';
import { env } from '$env/dynamic/private';
import type { Prisma } from '$lib/server/generated/prisma/client';
import { throwApiError } from './response';
import { writeAuditLog } from './admin';

export type Body = Record<string, unknown>;
export function bodyObject(value: unknown): Body {
	if (!value || typeof value !== 'object' || Array.isArray(value)) throwApiError(400, 'INVALID_REQUEST', 'Enter a valid object.');
	return value as Body;
}
export function fieldsOnly(body: Body, allowed: readonly string[]): void {
	if (Object.keys(body).some(key => !allowed.includes(key))) throwApiError(400, 'INVALID_REQUEST', 'Unsupported field.');
}
export function requiredText(value: unknown, field: string, max: number): string {
	if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throwApiError(422, 'INVALID_FIELD', `Enter ${field}.`, [{ field, reason: 'INVALID_VALUE' }]);
	return value.trim();
}
export function optionalText(value: unknown, field: string, max: number): string | null {
	if (value === undefined || value === null || value === '') return null;
	if (typeof value !== 'string' || value.trim().length > max) throwApiError(422, 'INVALID_FIELD', `Invalid ${field}.`, [{ field, reason: 'INVALID_VALUE' }]);
	return value.trim() || null;
}
export function positiveInteger(value: unknown, field: string, optional = false): number | null {
	if (optional && (value === undefined || value === null || value === '')) return null;
	if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1 || value > 1000000) throwApiError(422, 'INVALID_FIELD', `Invalid ${field}.`, [{ field, reason: 'INVALID_VALUE' }]);
	return value;
}
export function dateInput(value: unknown, field: string, optional = false): Date | null {
	if (optional && (value === undefined || value === null || value === '')) return null;
	if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throwApiError(422, 'INVALID_FIELD', `Invalid ${field}.`, [{ field, reason: 'INVALID_DATE' }]);
	const date = new Date(`${value}T00:00:00.000Z`);
	if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throwApiError(422, 'INVALID_FIELD', `Invalid ${field}.`, [{ field, reason: 'INVALID_DATE' }]);
	return date;
}
export function choice<T extends string>(value: unknown, field: string, choices: readonly T[]): T {
	if (typeof value !== 'string' || !choices.includes(value as T)) throwApiError(422, 'INVALID_FIELD', `Invalid ${field}.`, [{ field, reason: 'INVALID_VALUE' }]);
	return value as T;
}
export function productInput(body: Body) {
	fieldsOnly(body, ['name', 'manufacturer', 'edition', 'version', 'productCode', 'notes']);
	const name = requiredText(body.name, 'name', 255);
	const manufacturer = requiredText(body.manufacturer, 'manufacturer', 255);
	const edition = optionalText(body.edition, 'edition', 128);
	const version = optionalText(body.version, 'version', 128);
	return { name, manufacturer, edition, version, productCode: optionalText(body.productCode, 'productCode', 128), notes: optionalText(body.notes, 'notes', 5000), catalogKey: JSON.stringify([manufacturer, name, edition ?? '', version ?? ''].map(part => part.normalize('NFKC').trim().toLocaleLowerCase('und'))) };
}
export function contractInput(body: Body) {
	fieldsOnly(body, ['productId', 'reference', 'licenseType', 'purchasedQuantity', 'startsOn', 'endsOn', 'renewsOn', 'autoRenew', 'vendor', 'orderNumber', 'amount', 'currency', 'evidenceReference', 'notes', 'usersPerLicense', 'devicesPerUser', 'usersPerDevice', 'concurrentLimit', 'evidenceStatus', 'termsReference', 'termsNotes']);
	const productId = positiveInteger(body.productId, 'productId')!;
	const reference = requiredText(body.reference, 'reference', 255);
	const licenseType = choice(body.licenseType, 'licenseType', ['user', 'device', 'concurrent'] as const);
	const purchasedQuantity = positiveInteger(body.purchasedQuantity, 'purchasedQuantity')!;
	const startsOn = dateInput(body.startsOn, 'startsOn')!;
	const endsOn = dateInput(body.endsOn, 'endsOn', true);
	const renewsOn = dateInput(body.renewsOn, 'renewsOn', true);
	if ((endsOn && endsOn < startsOn) || (renewsOn && renewsOn < startsOn)) throwApiError(422, 'INVALID_DATE_RANGE', 'Contract dates are inconsistent.');
	if (body.autoRenew !== undefined && typeof body.autoRenew !== 'boolean') throwApiError(422, 'INVALID_FIELD', 'Invalid autoRenew.');
	const amount = body.amount === undefined || body.amount === null || body.amount === '' ? null : typeof body.amount === 'string' && /^\d{1,14}(?:\.\d{1,2})?$/.test(body.amount) ? body.amount : throwApiError(422, 'INVALID_FIELD', 'Invalid amount.');
	const currency = optionalText(body.currency, 'currency', 3);
	if (currency && !/^[A-Z]{3}$/.test(currency)) throwApiError(422, 'INVALID_FIELD', 'Invalid currency.');
	if ((amount === null) !== (currency === null)) throwApiError(422, 'INVALID_FIELD', 'Amount and currency must be entered together.');
	const usersPerLicense = positiveInteger(body.usersPerLicense, 'usersPerLicense', true);
	const devicesPerUser = positiveInteger(body.devicesPerUser, 'devicesPerUser', true);
	const usersPerDevice = positiveInteger(body.usersPerDevice, 'usersPerDevice', true);
	const concurrentLimit = positiveInteger(body.concurrentLimit, 'concurrentLimit', true);
	if (licenseType === 'user' && !usersPerLicense) throwApiError(422, 'INVALID_FIELD', 'Enter usersPerLicense.');
	if (licenseType !== 'user' && (usersPerLicense || devicesPerUser)) throwApiError(422, 'INVALID_FIELD', 'User limits require a user license.');
	if (licenseType !== 'device' && usersPerDevice) throwApiError(422, 'INVALID_FIELD', 'Users per device require a device license.');
	if (licenseType !== 'concurrent' && concurrentLimit) throwApiError(422, 'INVALID_FIELD', 'Concurrent limit requires a concurrent license.');
	const evidenceStatus = choice(body.evidenceStatus ?? 'unverified', 'evidenceStatus', ['confirmed', 'unverified'] as const);
	if (evidenceStatus === 'confirmed' && !optionalText(body.termsReference, 'termsReference', 2048) && !optionalText(body.evidenceReference, 'evidenceReference', 2048)) throwApiError(422, 'TERMS_SOURCE_REQUIRED', 'A source is required for confirmed terms.');
	const contract = { productId, reference, licenseType, purchasedQuantity, startsOn, endsOn, renewsOn, autoRenew: body.autoRenew ?? false, vendor: optionalText(body.vendor, 'vendor', 255), orderNumber: optionalText(body.orderNumber, 'orderNumber', 128), amount, currency, evidenceReference: optionalText(body.evidenceReference, 'evidenceReference', 2048), notes: optionalText(body.notes, 'notes', 5000) };
	const terms = { countingUnit: licenseType === 'user' ? 'employee' : licenseType === 'device' ? 'asset' : 'concurrent', usersPerLicense, devicesPerUser, usersPerDevice, concurrentLimit, evidenceStatus, termsReference: optionalText(body.termsReference, 'termsReference', 2048), notes: optionalText(body.termsNotes, 'termsNotes', 5000) };
	return { contract, terms };
}
export async function recordSoftwareChange(tx: Prisma.TransactionClient, actorId: number, resource: string, resourceId: number, action: string, changes: Prisma.InputJsonValue = {}) {
	await tx.softwareChangeHistory.create({ data: { actorId, resource, resourceId, action, changes } });
	await writeAuditLog(tx, actorId, action, resource, resourceId);
}
function secretKey(): Buffer {
	const encoded = env.IT_ASSET_CREDENTIAL_ENCRYPTION_KEY;
	if (!encoded) throw new Error('Credential encryption key is not configured.');
	const key = Buffer.from(encoded, 'base64url');
	if (key.length !== 32 || key.toString('base64url') !== encoded) throw new Error('Credential encryption key is invalid.');
	return key;
}
export function encryptLicenseKey(contractId: number, plaintext: string) {
	const key = secretKey();
	const initializationVector = randomBytes(12);
	const cipher = createCipheriv('aes-256-gcm', key, initializationVector);
	cipher.setAAD(Buffer.from(`sph:software-key:${contractId}:v1`));
	const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
	return { ciphertext: ciphertext.toString('base64url'), initializationVector: initializationVector.toString('base64url'), authenticationTag: cipher.getAuthTag().toString('base64url'), keyVersion: 1, fingerprint: createHmac('sha256', key).update(`sph:software-key:${contractId}:`).update(plaintext).digest('hex'), lastFour: plaintext.slice(-4) };
}
export function decryptLicenseKey(record: { contractId: number; ciphertext: string; initializationVector: string; authenticationTag: string; keyVersion: number }): string {
	if (record.keyVersion !== 1) throw new Error('Unsupported key version.');
	const cipher = createDecipheriv('aes-256-gcm', secretKey(), Buffer.from(record.initializationVector, 'base64url'));
	cipher.setAAD(Buffer.from(`sph:software-key:${record.contractId}:v1`));
	cipher.setAuthTag(Buffer.from(record.authenticationTag, 'base64url'));
	return Buffer.concat([cipher.update(Buffer.from(record.ciphertext, 'base64url')), cipher.final()]).toString('utf8');
}
export function publicKey(record: { id: number; contractId: number; label: string | null; lastFour: string; activationLimit: number | null; expiresOn: Date | null; notes: string | null }) {
	return { id: record.id, contractId: record.contractId, label: record.label, lastFour: record.lastFour, activationLimit: record.activationLimit, expiresOn: record.expiresOn, notes: record.notes };
}
export function contractMetrics(contract: { licenseType: string; purchasedQuantity: number; endsOn: Date | null; renewsOn: Date | null; startsOn: Date; terms: { usersPerLicense: number | null; devicesPerUser: number | null; usersPerDevice: number | null; evidenceStatus: string } | null; assignments: Array<{ employeeId: number | null; assetId: number | null; releasedOn: Date | null; employee: { deletedAt: Date | null; retiredAt: Date | null } | null; asset: { deletedAt: Date | null } | null }>; installations: Array<{ assetId: number; asset: { deletedAt: Date | null }; users: Array<{ employeeId: number; employee: { deletedAt: Date | null; retiredAt: Date | null } }> }> }) {
	const today = new Date();
	const day = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
	const activeAssignments = contract.assignments.filter(item => !item.releasedOn && (item.employee ? !item.employee.deletedAt && (!item.employee.retiredAt || item.employee.retiredAt > day) : item.asset ? !item.asset.deletedAt : false));
	const allocated = activeAssignments.length;
	const assignedEmployees = new Set(activeAssignments.map(item => item.employeeId).filter((id): id is number => id !== null));
	const assignedAssets = new Set(activeAssignments.map(item => item.assetId).filter((id): id is number => id !== null));
	const activeInstallations = contract.installations;
	const devicesByUser = new Map<number, Set<number>>();
	let observedUsers = 0;
	let unmatchedRecords = 0;
	let overLimitDevices = 0;
	for (const installation of activeInstallations) {
		if (installation.asset.deletedAt) unmatchedRecords++;
		if (contract.licenseType === 'device' && !assignedAssets.has(installation.assetId)) unmatchedRecords++;
		const users = installation.users;
		observedUsers += users.length;
		if (contract.terms?.usersPerDevice && users.length > contract.terms.usersPerDevice) overLimitDevices++;
		for (const user of users) {
			if (user.employee.deletedAt || (user.employee.retiredAt && user.employee.retiredAt <= day)) unmatchedRecords++;
			if (contract.licenseType === 'user' && !assignedEmployees.has(user.employeeId)) unmatchedRecords++;
			if (!devicesByUser.has(user.employeeId)) devicesByUser.set(user.employeeId, new Set());
			devicesByUser.get(user.employeeId)!.add(installation.assetId);
		}
	}
	const overLimitUsers = contract.terms?.devicesPerUser ? [...devicesByUser.values()].filter(assets => assets.size > contract.terms!.devicesPerUser!).length : 0;
	const missingObservation = activeInstallations.some(item => item.users.length === 0) || allocated > 0 && (contract.licenseType === 'device' ? [...assignedAssets].some(assetId => !activeInstallations.some(item => item.assetId === assetId)) : [...assignedEmployees].some(employeeId => !devicesByUser.has(employeeId)));
	const capacity = contract.licenseType === 'user' ? contract.purchasedQuantity * (contract.terms?.usersPerLicense ?? 0) : contract.licenseType === 'device' ? contract.purchasedQuantity : null;
	const expiry = contract.renewsOn ?? contract.endsOn;
	const daysToRenewal = expiry ? Math.ceil((expiry.getTime() - day.getTime()) / 86400000) : null;
	const status = contract.licenseType === 'concurrent' ? 'pending_measurement' : contract.terms?.evidenceStatus !== 'confirmed' ? 'needs_review' : contract.endsOn && contract.endsOn < day ? 'expired' : contract.startsOn > day ? 'not_started' : capacity !== null && (allocated > capacity || overLimitDevices || overLimitUsers) ? 'overallocated' : unmatchedRecords || missingObservation ? 'needs_review' : 'compliant';
	return { countingUnit: contract.licenseType === 'user' ? 'employee' : contract.licenseType === 'device' ? 'asset' : 'concurrent', allocated, capacity, remaining: capacity === null ? null : Math.max(0, capacity - allocated), overage: capacity === null ? null : Math.max(0, allocated - capacity), observedInstallations: activeInstallations.length, observedUsers, unmatchedRecords, overLimitDevices, overLimitUsers, missingObservation, daysToRenewal, status };
}
