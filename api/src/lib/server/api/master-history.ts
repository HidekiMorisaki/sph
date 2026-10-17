import type { Prisma } from '$lib/server/generated/prisma/client';

export const masterHistoryFields = {
 clients: ['name', 'countryCode', 'postalCode', 'prefecture', 'city', 'streetAddress', 'buildingName', 'phoneNumber1', 'phoneNumber2', 'faxNumber1', 'faxNumber2', 'notes', 'companyName', 'contactName', 'contactDepartment', 'contactEmail', 'contactMobile'],
 projects: ['name','description','clientId','contractStartsOn','contractEndsOn'],
	departments: ['name', 'sortOrder', 'notes'],
	'employee-groups': ['name', 'departmentId', 'sortOrder', 'notes'],
	positions: ['name', 'sortOrder', 'notes'],
	'employment-types': ['name', 'sortOrder', 'notes'],
	branches: ['name', 'openedOn', 'closedOn', 'countryCode', 'postalCode', 'prefecture', 'city', 'streetAddress', 'buildingName', 'phoneNumber1', 'phoneNumber1Label', 'phoneNumber2', 'phoneNumber2Label', 'faxNumber1', 'faxNumber1Label', 'faxNumber2', 'faxNumber2Label', 'managerEmployeeId', 'deputyManagerEmployeeId', 'notes', 'sortOrder'],
	room: ['name', 'branchId', 'notes', 'sortOrder'],
	storage: ['name', 'roomId', 'notes', 'sortOrder'],
	'it-asset-types': ['name', 'managementCodePrefix', 'supportsCpu', 'supportsRam', 'supportsOs', 'supportsLoginUsername', 'sortOrder', 'notes'],
	manufacturers: ['name', 'officialUrl', 'sourceCheckedOn', 'sortOrder', 'notes'],
	'cpu-types': ['name', 'manufacturerId', 'series', 'modelNumber', 'officialUrl', 'sourceCheckedOn', 'sortOrder', 'notes'],
	'operating-system-vendors': ['name', 'sortOrder', 'notes'],
	'operating-systems': ['vendorId', 'product', 'version', 'edition', 'architecture', 'officialUrl', 'sourceCheckedOn', 'sortOrder', 'notes'],
	'it-asset-statuses': ['name', 'disposalDatePolicy', 'sortOrder', 'notes'],
	role: ['name', 'sortOrder', 'notes'],
	external_link: ['name', 'url', 'sortOrder', 'notes']
} as const;

export type MasterHistoryResource = keyof typeof masterHistoryFields;
type Snapshot = Record<string, string | { id: number } | null>;

function value(raw: unknown, field: string): string | null {
	if (raw === null || raw === undefined) return null;
	if (raw instanceof Date) return field === 'contractStartsOn' || field === 'contractEndsOn' || field === 'openedOn' || field === 'closedOn' || field === 'sourceCheckedOn' ? raw.toISOString().slice(0, 10) : raw.toISOString();
	return String(raw);
}

export async function readMasterSnapshot(tx: Prisma.TransactionClient, resource: MasterHistoryResource, id: number): Promise<Snapshot | null> {
	let item: unknown;
	switch (resource) {
		case 'clients': item = await tx.client.findUnique({ where: { id } }); break;
        case 'projects': item = await tx.project.findUnique({ where: { id }, include: { client: { select: { name: true } } } }); break;
        case 'departments': item = await tx.department.findUnique({ where: { id } }); break;
		case 'employee-groups': item = await tx.employeeGroup.findUnique({ where: { id }, include: { department: { select: { name: true } } } }); break;
		case 'positions': item = await tx.position.findUnique({ where: { id } }); break;
		case 'employment-types': item = await tx.employmentType.findUnique({ where: { id } }); break;
		case 'branches': item = await tx.branch.findUnique({ where: { id } }); break;
		case 'room': item = await tx.room.findUnique({ where: { id }, include: { branch: { select: { name: true } } } }); break;
		case 'storage': item = await tx.storage.findUnique({ where: { id }, include: { room: { select: { name: true } } } }); break;
		case 'it-asset-types': item = await tx.itAssetType.findUnique({ where: { id } }); break;
		case 'manufacturers': item = await tx.manufacturer.findUnique({ where: { id } }); break;
		case 'cpu-types': item = await tx.cpuType.findUnique({ where: { id }, include: { manufacturer: { select: { name: true } } } }); break;
		case 'operating-system-vendors': item = await tx.operatingSystemVendor.findUnique({ where: { id } }); break;
		case 'operating-systems': item = await tx.operatingSystem.findUnique({ where: { id }, include: { vendor: { select: { name: true } } } }); break;
		case 'it-asset-statuses': item = await tx.itAssetStatus.findUnique({ where: { id } }); break;
		case 'role': item = await tx.role.findUnique({ where: { id } }); break;
		case 'external_link': item = await tx.externalLink.findUnique({ where: { id } }); break;
	}
	if (!item) return null;
	const record = item as Record<string, unknown>;
	if (resource === 'projects') record.clientId = (record.client as {name:string}|null)?.name ?? null;
 if (resource === 'employee-groups') record.departmentId = (record.department as { name: string }).name;
	if (resource === 'room') record.branchId = (record.branch as { name: string }).name;
	if (resource === 'storage') record.roomId = (record.room as { name: string }).name;
	if (resource === 'cpu-types') record.manufacturerId = (record.manufacturer as { name: string }).name;
	if (resource === 'operating-systems') record.vendorId = (record.vendor as { name: string }).name;
	return Object.fromEntries(masterHistoryFields[resource].map((field) => [field,
		resource === 'branches' && (field === 'managerEmployeeId' || field === 'deputyManagerEmployeeId')
			? record[field] === null ? null : { id: Number(record[field]) }
			: value(record[field], field)
	]));
}

export async function recordMasterChange(tx: Prisma.TransactionClient, resource: MasterHistoryResource, id: number, actorId: number, action: 'create' | 'update' | 'delete' | 'restore', before: Snapshot | null, after: Snapshot | null): Promise<void> {
	const changes = masterHistoryFields[resource].flatMap((field) => {
		const previous = before?.[field] ?? null;
		const next = after?.[field] ?? null;
		return JSON.stringify(previous) === JSON.stringify(next) ? [] : [{ field, before: previous, after: next }];
	});
	if (action === 'update' && changes.length === 0) return;
	await tx.masterChangeHistory.create({ data: { resource, resourceId: id, actorId, action, changes } });
}
