import type { Prisma } from '$lib/server/generated/prisma/client';
import type { ApiErrorDetail } from '$lib/server/api/response';

type Body = Record<string, unknown>;
const nullableText = (body: Body, key: string, max = 5000) => typeof body[key] === 'string' && body[key].trim() ? body[key].trim().slice(0, max) : null;
const parseId = (raw: unknown) => raw === null || raw === undefined || raw === '' ? null : typeof raw === 'number' && Number.isSafeInteger(raw) && raw > 0 ? raw : typeof raw === 'string' && /^\d+$/.test(raw) && Number.isSafeInteger(Number(raw)) && Number(raw) > 0 ? Number(raw) : NaN;
const parseDate = (raw: unknown) => {
	if (raw === null || raw === undefined || raw === '') return null;
	if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return undefined;
	const date = new Date(`${raw}T00:00:00.000Z`);
	return Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== raw ? undefined : date;
};

export function parseItAssetInput(value: unknown) {
	const body: Body = value && typeof value === 'object' && !Array.isArray(value) ? value as Body : {};
	const details: ApiErrorDetail[] = [];
	const assetTag = '';
	const ids = Object.fromEntries(['typeId', 'manufacturerId', 'cpuTypeId', 'operatingSystemId', 'locationId', 'statusId'].map(key => [key, parseId(body[key])])) as Record<string, number | null>;
	for (const key of ['typeId', 'locationId', 'statusId']) if (ids[key] === null) details.push({ field: key, reason: 'Select a value.' });
	for (const [key, id] of Object.entries(ids)) if (Number.isNaN(id)) details.push({ field: key, reason: 'Select a valid value.' });
	const purchasedOn = parseDate(body.purchasedOn);
	const assigneeId = Object.hasOwn(body, 'assigneeId') ? parseId(body.assigneeId) : undefined;
	if (assigneeId !== undefined && Number.isNaN(assigneeId)) details.push({ field: 'assigneeId', reason: 'Select a valid employee.' });
	const disposalOn = parseDate(body.disposalOn);
	if (purchasedOn === null) details.push({ field: 'purchasedOn', reason: 'Select a purchase date.' });
	if (purchasedOn === undefined) details.push({ field: 'purchasedOn', reason: 'Enter a valid date in yyyy-mm-dd format.' });
	if (disposalOn === undefined) details.push({ field: 'disposalOn', reason: 'Enter a valid date in yyyy-mm-dd format.' });
	if (purchasedOn && disposalOn && disposalOn < purchasedOn) details.push({ field: 'disposalOn', reason: 'Disposal date cannot be before purchase date.' });
	const rawRam = body.ramGb;
	const ramGb = rawRam === '' || rawRam === null || rawRam === undefined ? null : typeof rawRam === 'number' ? rawRam : typeof rawRam === 'string' && /^\d+$/.test(rawRam) ? Number(rawRam) : NaN;
	if (ramGb !== null && (!Number.isSafeInteger(ramGb) || ramGb < 1)) details.push({ field: 'ramGb', reason: 'Enter a whole number greater than zero.' });
	if (details.length) return { data: null, details, assigneeId };
	return { data: { assetTag: assetTag!, typeId: ids.typeId!, manufacturerId: ids.manufacturerId, modelNumber: nullableText(body, 'modelNumber', 255), serialNumber: nullableText(body, 'serialNumber', 255), cpuTypeId: ids.cpuTypeId, ramGb, operatingSystemId: ids.operatingSystemId, loginUsername: nullableText(body, 'loginUsername', 255), locationId: ids.locationId!, statusId: ids.statusId!, purchasedOn: purchasedOn!, disposalOn: disposalOn!, notes: nullableText(body, 'notes') }, details, assigneeId };
}

type ItAssetData = NonNullable<ReturnType<typeof parseItAssetInput>['data']>;
export async function itAssetReferenceErrors(tx: Prisma.TransactionClient, data: ItAssetData): Promise<ApiErrorDetail[]> {
	const [type, manufacturer, cpu, os, location, status] = await Promise.all([
		tx.itAssetType.findFirst({ where: { id: data.typeId, deletedAt: null } }),
		data.manufacturerId === null ? true : tx.manufacturer.count({ where: { id: data.manufacturerId, deletedAt: null } }).then(Boolean),
		data.cpuTypeId === null ? true : tx.cpuType.count({ where: { id: data.cpuTypeId, deletedAt: null } }).then(Boolean),
		data.operatingSystemId === null ? true : tx.operatingSystem.count({ where: { id: data.operatingSystemId, deletedAt: null } }).then(Boolean),
		tx.storageLocation.count({ where: { id: data.locationId, deletedAt: null, room: { deletedAt: null, branch: { deletedAt: null } } } }).then(Boolean),
		tx.itAssetStatus.findFirst({ where: { id: data.statusId, deletedAt: null } })
	]);
	const details: ApiErrorDetail[] = [];
	if (!type) details.push({ field: 'typeId', reason: 'Select an existing type.' });
	if (!manufacturer) details.push({ field: 'manufacturerId', reason: 'Select an existing manufacturer.' });
	if (!cpu) details.push({ field: 'cpuTypeId', reason: 'Select an existing CPU type.' });
	if (!os) details.push({ field: 'operatingSystemId', reason: 'Select an existing operating system.' });
	if (!location) details.push({ field: 'locationId', reason: 'Select an existing storage location.' });
	if (!status) details.push({ field: 'statusId', reason: 'Select an existing status.' });
	if (type && !type.supportsCpu && data.cpuTypeId !== null) details.push({ field: 'cpuTypeId', reason: 'This type does not support a CPU type.' });
	if (type && !type.supportsRam && data.ramGb !== null) details.push({ field: 'ramGb', reason: 'This type does not support RAM.' });
	if (type && !type.supportsOs && data.operatingSystemId !== null) details.push({ field: 'operatingSystemId', reason: 'This type does not support an operating system.' });
	if (type && !type.supportsLoginUsername && data.loginUsername !== null) details.push({ field: 'loginUsername', reason: 'This type does not support a login username.' });
	if (type && (type.code === 'UTM' || type.code === 'UPS') && (data.cpuTypeId !== null || data.ramGb !== null || data.operatingSystemId !== null || data.loginUsername !== null)) details.push({ field: 'typeId', reason: 'This type does not use hardware and software details.' });
	if (status?.disposalDatePolicy === 'required' && !data.disposalOn) details.push({ field: 'disposalOn', reason: 'Select a disposal date for this status.' });
	if (status?.disposalDatePolicy === 'prohibited' && data.disposalOn) details.push({ field: 'disposalOn', reason: 'This status does not allow a disposal date.' });
	return details;
}

export const itAssetInclude = {
	type: true, manufacturer: true, cpuType: true, operatingSystem: true, status: true,
	location: { include: { room: { include: { branch: true } } } },
	assignments: { where: { returnedAt: null, deletedAt: null }, include: { employee: { select: { id: true, employeeCode: true, firstName: true, middleName: true, lastName: true } } }, take: 1 }
} as const;
