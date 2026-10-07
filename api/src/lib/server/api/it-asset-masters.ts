import { writeAuditLog } from '$lib/server/api/admin';
import { readMasterSnapshot, recordMasterChange } from '$lib/server/api/master-history';
import type { ListQuery } from '$lib/server/api/query';
import type { Prisma } from '$lib/server/generated/prisma/client';
import { getPrisma } from '$lib/server/prisma';

export const itAssetMasterResources = ['it-asset-types', 'manufacturers', 'cpu-types', 'operating-system-vendors', 'operating-systems', 'it-asset-statuses'] as const;
export type ItAssetMasterResource = (typeof itAssetMasterResources)[number];
export const itAssetMasterSortFields = ['id', 'name', 'managementCodePrefix', 'vendor', 'product', 'version', 'officialUrl', 'disposalDatePolicy', 'sortOrder', 'createdAt', 'updatedAt'] as const;
export type ItAssetMasterSortField = (typeof itAssetMasterSortFields)[number];
export const cpuTypeSortFields = ['id', 'sortOrder', 'createdAt', 'updatedAt', 'name', 'manufacturer', 'series', 'modelNumber'] as const;
export type CpuTypeSortField = (typeof cpuTypeSortFields)[number];

function withUsageCount<T extends object>(item: T): Omit<T, '_count'> & { usageCount: number } {
	const { _count, ...value } = item as T & { _count: Record<string, number> };
	return { ...value, usageCount: Object.values(_count).reduce((total, count) => total + count, 0) };
}

export function cpuTypeConflictField(error: unknown): 'name' | 'modelNumber' | null {
	if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'P2002') return null;
	const meta = 'meta' in error && error.meta && typeof error.meta === 'object' ? error.meta : null;
	const target = meta && 'target' in meta ? meta.target : null;
	const columns = `${Array.isArray(target) ? target.map(String).join(' ') : String(target ?? '')} ${String(error)}`;
	if (columns.includes('name')) return 'name';
	if (columns.includes('model_number') || columns.includes('modelNumber')) return 'modelNumber';
	return null;
}

export function operatingSystemConflictField(error: unknown): 'version' | null {
	if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'P2002') return null;
	const meta = 'meta' in error && error.meta && typeof error.meta === 'object' ? error.meta : null;
	const target = meta && 'target' in meta ? meta.target : null;
	const columns = `${Array.isArray(target) ? target.map(String).join(' ') : String(target ?? '')} ${String(error)}`;
	return columns.includes('operating_systems_') || columns.includes('vendor') || columns.includes('product') ? 'version' : null;
}

export class InactiveOperatingSystemVendorError extends Error {}
export function operatingSystemNameError(error: unknown): 'duplicate' | 'too_long' | null {
	const value = String(error);
	if (value.includes('operating_systems_generated_name_key') || value.includes('operating_systems_natural_key')) return 'duplicate';
	if (value.includes('operating_systems_name_length')) return 'too_long';
	return null;
}

export function isItAssetMasterResource(value: string): value is ItAssetMasterResource {
	return itAssetMasterResources.includes(value as ItAssetMasterResource);
}

const text = (body: Record<string, unknown>, key: string, max = 255, required = false) => {
	const value = typeof body[key] === 'string' ? body[key].trim() : '';
	return value && value.length <= max ? value : required ? undefined : null;
};
const integer = (body: Record<string, unknown>, key: string, required = false) => {
	const raw = body[key];
	const value = typeof raw === 'number' ? raw : typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) : NaN;
	return Number.isSafeInteger(value) && value >= 0 ? value : required ? undefined : 9999;
};
const date = (body: Record<string, unknown>, key: string) => {
	const value = text(body, key, 10);
	if (!value) return null;
	const parsed = new Date(`${value}T00:00:00.000Z`);
	return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value ? parsed : undefined;
};

export function parseItAssetMasterInput(resource: ItAssetMasterResource, value: unknown): Record<string, unknown> | null {
	if (!value || typeof value !== 'object') return null;
	const body = value as Record<string, unknown>;
	const name = text(body, 'name', 128, true); const sortOrder = integer(body, 'sortOrder');
	const notes = text(body, 'notes', 5000);
	if (sortOrder === undefined || (body.notes != null && body.notes !== '' && (typeof body.notes !== 'string' || body.notes.trim().length > 5000))) return null;
	switch (resource) {
		case 'it-asset-types':
			{ const managementCodePrefix = text(body, 'managementCodePrefix', 5, true); if (!name || !managementCodePrefix || !/^[A-Z]{3,5}$/.test(managementCodePrefix)) return null;
			return { name, managementCodePrefix, supportsCpu: body.supportsCpu === true, supportsRam: body.supportsRam === true, supportsOs: body.supportsOs === true, supportsLoginUsername: body.supportsLoginUsername === true, sortOrder, notes }; }
		case 'manufacturers':
			if (!name) return null;
			{ const sourceCheckedOn = date(body, 'sourceCheckedOn'); if (sourceCheckedOn === undefined) return null; return { name, officialUrl: text(body, 'officialUrl', 1000), sourceCheckedOn, sortOrder, notes }; }
		case 'operating-system-vendors':
			return name ? { name, sortOrder, notes } : null;
		case 'cpu-types': {
			const manufacturerId = integer(body, 'manufacturerId', true); const series = text(body, 'series', 128, true); const modelNumber = text(body, 'modelNumber', 128, true); const name = text(body, 'name', 255, true);
			const sourceCheckedOn = date(body, 'sourceCheckedOn');
			if (!manufacturerId || !series || !modelNumber || !name || sourceCheckedOn === undefined) return null;
			return { manufacturerId, series, modelNumber, name, officialUrl: text(body, 'officialUrl', 1000), sourceCheckedOn, sortOrder, notes };
		}
		case 'operating-systems': {
			if (Object.hasOwn(body, 'displayName')) return null;
			const vendorId = integer(body, 'vendorId', true); const product = text(body, 'product', 128, true); const version = text(body, 'version', 64, true);
			const sourceCheckedOn = date(body, 'sourceCheckedOn');
			if (!vendorId || !product || !version || sourceCheckedOn === undefined || Object.hasOwn(body, 'vendor')) return null;
			const edition = text(body, 'edition', 128); const architecture = text(body, 'architecture', 32);
			return { vendorId, product, version, edition, architecture, officialUrl: text(body, 'officialUrl', 1000), sourceCheckedOn, sortOrder, notes };
		}
		case 'it-asset-statuses': {
			if (!name) return null;
			const policy = text(body, 'disposalDatePolicy', 16, true);
			if (!policy || !['prohibited', 'optional', 'required'].includes(policy)) return null;
			return { name, disposalDatePolicy: policy, sortOrder, notes };
		}
	}
}

export async function listItAssetMasters(resource: ItAssetMasterResource, query: ListQuery<ItAssetMasterSortField | CpuTypeSortField>, search = '') {
	const match = (field: string) => ({ [field]: { contains: search, mode: 'insensitive' as const } });
	const searched = (fields: string[]) => ({ deletedAt: null, ...(search ? { OR: fields.map(match) } : {}) });
	const orderBy = [{ [query.sortBy]: query.sortOrder }, ...(query.sortBy === 'id' ? [] : [{ id: 'asc' as const }])]; const db = getPrisma();
	switch (resource) {
		case 'it-asset-types': { const where = searched(['name', 'managementCodePrefix']); return { total: await db.itAssetType.count({ where }), items: (await db.itAssetType.findMany({ where, skip: query.offset, take: query.limit, orderBy: orderBy as Prisma.ItAssetTypeOrderByWithRelationInput[], include: { _count: { select: { assets: { where: { deletedAt: null } } } } } })).map(withUsageCount) }; }
		case 'manufacturers': { const where = searched(['name', 'officialUrl']); return { total: await db.manufacturer.count({ where }), items: (await db.manufacturer.findMany({ where, skip: query.offset, take: query.limit, orderBy: orderBy as Prisma.ManufacturerOrderByWithRelationInput[], include: { _count: { select: { assets: { where: { deletedAt: null } }, cpuTypes: { where: { deletedAt: null } } } } } })).map(withUsageCount) }; }
		case 'operating-system-vendors': { const where = searched(['name']); return { total: await db.operatingSystemVendor.count({ where }), items: (await db.operatingSystemVendor.findMany({ where, skip: query.offset, take: query.limit, orderBy: orderBy as Prisma.OperatingSystemVendorOrderByWithRelationInput[], include: { _count: { select: { operatingSystems: true } } } })).map(withUsageCount) }; }
		case 'cpu-types': {
			const cpuWhere: Prisma.CpuTypeWhereInput = { deletedAt: null, ...(search ? { OR: [
				{ name: { contains: search, mode: 'insensitive' } },
				{ series: { contains: search, mode: 'insensitive' } },
				{ modelNumber: { contains: search, mode: 'insensitive' } },
				{ manufacturer: { is: { name: { contains: search, mode: 'insensitive' }, deletedAt: null } } }
			] } : {}) };
			const cpuOrderBy: Prisma.CpuTypeOrderByWithRelationInput[] = [
				query.sortBy === 'manufacturer' ? { manufacturer: { name: query.sortOrder } } : { [query.sortBy]: query.sortOrder },
				...(query.sortBy === 'id' ? [] : [{ id: 'asc' as const }])
			];
			return { total: await db.cpuType.count({ where: cpuWhere }), items: (await db.cpuType.findMany({ where: cpuWhere, skip: query.offset, take: query.limit, include: { manufacturer: true, _count: { select: { assets: { where: { deletedAt: null } } } } }, orderBy: cpuOrderBy })).map(withUsageCount) };
		}
		case 'operating-systems': {
			const where: Prisma.OperatingSystemWhereInput = {
				deletedAt: null,
				...(search ? { OR: [
					{ vendor: { is: { name: { contains: search, mode: 'insensitive' } } } },
					...['product', 'version', 'edition', 'architecture'].map(match)
				] } : {})
			};
			const osOrderBy: Prisma.OperatingSystemOrderByWithRelationInput[] = [
				query.sortBy === 'vendor' ? { vendor: { name: query.sortOrder } } : { [query.sortBy]: query.sortOrder },
				...(query.sortBy === 'id' ? [] : [{ id: 'asc' as const }])
			];
			const items = await db.operatingSystem.findMany({
				where, skip: query.offset, take: query.limit, orderBy: osOrderBy,
				include: { vendor: { select: { id: true, name: true } }, _count: { select: { assets: { where: { deletedAt: null } } } } }
			});
			return { total: await db.operatingSystem.count({ where }), items: items.map(withUsageCount) };
		}
		case 'it-asset-statuses': { const where = searched(['name', 'disposalDatePolicy']); return { total: await db.itAssetStatus.count({ where }), items: (await db.itAssetStatus.findMany({ where, skip: query.offset, take: query.limit, orderBy: orderBy as Prisma.ItAssetStatusOrderByWithRelationInput[], include: { _count: { select: { assets: { where: { deletedAt: null } } } } } })).map(withUsageCount) }; }
	}
}

export async function createItAssetMaster(resource: ItAssetMasterResource, data: Record<string, unknown>, actorId: number) {
	return getPrisma().$transaction(async (tx) => {
		if (resource === 'cpu-types' && !await tx.manufacturer.count({ where: { id: data.manufacturerId as number, deletedAt: null } })) throw new Error('inactive manufacturer');
		if (resource === 'operating-systems' && !await tx.operatingSystemVendor.count({ where: { id: data.vendorId as number, deletedAt: null } })) throw new InactiveOperatingSystemVendorError();
		let item: { id: number };
		switch (resource) {
			case 'it-asset-types': item = await tx.itAssetType.create({ data: data as never }); break;
			case 'manufacturers': item = await tx.manufacturer.create({ data: data as never }); break;
			case 'operating-system-vendors': item = await tx.operatingSystemVendor.create({ data: data as never }); break;
			case 'cpu-types': item = await tx.cpuType.create({ data: data as never }); break;
			case 'operating-systems': item = await tx.operatingSystem.create({ data: data as never }); break;
			case 'it-asset-statuses': item = await tx.itAssetStatus.create({ data: data as never }); break;
		}
		await writeAuditLog(tx, actorId, 'create', resource, item.id);
		await recordMasterChange(tx, resource, item.id, actorId, 'create', null, await readMasterSnapshot(tx, resource, item.id));
		if (resource === 'operating-systems') return tx.operatingSystem.findUniqueOrThrow({ where: { id: item.id }, include: { vendor: { select: { id: true, name: true } } } });
		return item;
	});
}

export async function updateItAssetMaster(resource: ItAssetMasterResource, id: number, data: Record<string, unknown>, actorId: number) {
	return getPrisma().$transaction(async (tx) => {
		const before = await readMasterSnapshot(tx, resource, id);
		if (resource === 'cpu-types' && !await tx.manufacturer.count({ where: { id: data.manufacturerId as number, deletedAt: null } })) throw new Error('inactive manufacturer');
		if (resource === 'operating-systems' && !await tx.operatingSystemVendor.count({ where: { id: data.vendorId as number, deletedAt: null } })) throw new InactiveOperatingSystemVendorError();
		if (resource === 'it-asset-types') {
			const current = await tx.itAssetType.findFirst({ where: { id, deletedAt: null }, select: { managementCodePrefix: true, nextManagementNumber: true } });
			if (current && current.managementCodePrefix !== data.managementCodePrefix && (current.nextManagementNumber > 1 || await tx.itAsset.count({ where: { typeId: id } }))) throw new Error('management code prefix is in use');
		}
		let result: { count: number };
		switch (resource) {
			case 'it-asset-types': result = await tx.itAssetType.updateMany({ where: { id, deletedAt: null }, data: data as never }); break;
			case 'manufacturers': result = await tx.manufacturer.updateMany({ where: { id, deletedAt: null }, data: data as never }); break;
			case 'operating-system-vendors': result = await tx.operatingSystemVendor.updateMany({ where: { id, deletedAt: null }, data: data as never }); break;
			case 'cpu-types': result = await tx.cpuType.updateMany({ where: { id, deletedAt: null }, data: data as never }); break;
			case 'operating-systems': result = await tx.operatingSystem.updateMany({ where: { id, deletedAt: null }, data: data as never }); break;
			case 'it-asset-statuses': result = await tx.itAssetStatus.updateMany({ where: { id, deletedAt: null }, data: data as never }); break;
		}
		if (!result.count) return null;
		await writeAuditLog(tx, actorId, 'update', resource, id);
		await recordMasterChange(tx, resource, id, actorId, 'update', before, await readMasterSnapshot(tx, resource, id));
		if (resource === 'operating-systems') return tx.operatingSystem.findUniqueOrThrow({ where: { id }, include: { vendor: { select: { id: true, name: true } } } });
		return { id, ...data };
	});
}

export async function deleteItAssetMaster(resource: ItAssetMasterResource, id: number, actorId: number): Promise<'deleted' | 'not_found' | 'referenced'> {
	return getPrisma().$transaction(async (tx) => {
		const before = await readMasterSnapshot(tx, resource, id);
		let references = 0;
		switch (resource) {
			case 'it-asset-types': references = await tx.itAsset.count({ where: { typeId: id, deletedAt: null } }); break;
			case 'manufacturers': references = await tx.itAsset.count({ where: { manufacturerId: id, deletedAt: null } }) + await tx.cpuType.count({ where: { manufacturerId: id, deletedAt: null } }); break;
			case 'operating-system-vendors': references = await tx.operatingSystem.count({ where: { vendorId: id } }); break;
			case 'cpu-types': references = await tx.itAsset.count({ where: { cpuTypeId: id, deletedAt: null } }); break;
			case 'operating-systems': references = await tx.itAsset.count({ where: { operatingSystemId: id, deletedAt: null } }); break;
			case 'it-asset-statuses': references = await tx.itAsset.count({ where: { statusId: id, deletedAt: null } }); break;
		}
		if (references) return 'referenced'; const deletedAt = new Date(); let result: { count: number };
		switch (resource) {
			case 'it-asset-types': result = await tx.itAssetType.updateMany({ where: { id, deletedAt: null }, data: { deletedAt } }); break;
			case 'manufacturers': result = await tx.manufacturer.updateMany({ where: { id, deletedAt: null }, data: { deletedAt } }); break;
			case 'operating-system-vendors': result = await tx.operatingSystemVendor.updateMany({ where: { id, deletedAt: null }, data: { deletedAt } }); break;
			case 'cpu-types': result = await tx.cpuType.updateMany({ where: { id, deletedAt: null }, data: { deletedAt } }); break;
			case 'operating-systems': result = await tx.operatingSystem.updateMany({ where: { id, deletedAt: null }, data: { deletedAt } }); break;
			case 'it-asset-statuses': result = await tx.itAssetStatus.updateMany({ where: { id, deletedAt: null }, data: { deletedAt } }); break;
		}
		if (!result.count) return 'not_found';
		await writeAuditLog(tx, actorId, 'delete', resource, id);
		await recordMasterChange(tx, resource, id, actorId, 'delete', before, null);
		return 'deleted';
	}, { isolationLevel: 'Serializable' });
}
