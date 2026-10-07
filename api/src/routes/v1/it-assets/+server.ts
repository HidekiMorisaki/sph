import { requireAssetCredentialWriteApi, requireAssetWriteApi, requireOperationApi, writeAuditLog } from '$lib/server/api/admin';
import { permissionOperations } from '$lib/server/auth/permissions';
import { applyCredentialChanges, parseCredentialChanges } from '$lib/server/api/it-asset-credentials';
import { itAssetInclude, itAssetReferenceErrors, parseItAssetInput } from '$lib/server/api/it-asset-input';
import { reserveManagementCode, resolveManagementCode } from '$lib/server/api/it-asset-management-code';
import { ItAssetValidationError, itAssetErrorResponse } from '$lib/server/api/it-asset-errors';
import { changeAssignee, readAssetFields, recordAssetChange } from '$lib/server/api/it-asset-history';
import { syncAssetIpAddresses } from '$lib/server/api/it-asset-network';
import { itAssetOutput } from '$lib/server/api/it-asset-output';
import { listMeta, parseListQuery } from '$lib/server/api/query';
import { containsPattern, parseVisibleSearch } from '$lib/server/api/visible-list-search';
import { failure, success, throwApiError } from '$lib/server/api/response';
import { Prisma } from '$lib/server/generated/prisma/client';
import { getPrisma } from '$lib/server/prisma';

const sortFields = ['id', 'assetTag', 'type', 'manufacturer', 'modelNumber', 'serialNumber', 'branch', 'room', 'storage', 'user', 'status', 'ramGb', 'purchasedOn', 'disposalOn', 'createdAt', 'updatedAt'] as const;
type SortField = (typeof sortFields)[number];
const visibleSearchKeys = ['assetTag', 'notes', 'type', 'manufacturer', 'modelNumber', 'branch', 'room', 'storage', 'user', 'status'] as const;
function assetOrderBy(field: SortField, direction: 'asc' | 'desc'): Prisma.ItAssetOrderByWithRelationInput[] {
	switch (field) {
		case 'type': return [{ type: { name: direction } }, { id: 'asc' }];
		case 'manufacturer': return [{ manufacturer: { name: direction } }, { modelNumber: direction }, { id: 'asc' }];
		case 'branch': return [{ storage: { room: { branch: { name: direction } } } }, { id: 'asc' }];
		case 'room': return [{ storage: { room: { name: direction } } }, { id: 'asc' }];
		case 'storage': return [{ storage: { name: direction } }, { id: 'asc' }];
		case 'status': return [{ status: { name: direction } }, { id: 'asc' }];
		default: return [{ [field]: direction }, { id: 'asc' }];
	}
}
const filterId = (url: URL, key: string) => { const raw = url.searchParams.get(key); return raw && /^\d+$/.test(raw) ? Number(raw) : undefined; };
async function visibleAssetPage(tx: Prisma.TransactionClient, url: URL, search: string, keys: string[], sortBy: SortField, sortOrder: 'asc' | 'desc', offset: number, limit: number) {
	const pattern = containsPattern(search);
	const fields: Record<(typeof visibleSearchKeys)[number], Prisma.Sql> = {
		assetTag: Prisma.sql`asset.asset_tag ILIKE ${pattern}`,
		notes: Prisma.sql`asset.notes ILIKE ${pattern}`,
		type: Prisma.sql`type.name ILIKE ${pattern}`,
		manufacturer: Prisma.sql`manufacturer.name ILIKE ${pattern}`,
		modelNumber: Prisma.sql`asset.model_number ILIKE ${pattern}`,
		branch: Prisma.sql`branch.name ILIKE ${pattern}`,
		room: Prisma.sql`room.name ILIKE ${pattern}`,
		storage: Prisma.sql`location.name ILIKE ${pattern}`,
		user: Prisma.sql`(assignee.first_name ILIKE ${pattern} OR assignee.middle_name ILIKE ${pattern} OR assignee.last_name ILIKE ${pattern}
			OR concat_ws(' ', assignee.first_name, assignee.middle_name, assignee.last_name) ILIKE ${pattern}
			OR concat_ws(' ', assignee.last_name, assignee.middle_name, assignee.first_name) ILIKE ${pattern})`,
		status: Prisma.sql`status.name ILIKE ${pattern}`
	};
	const conditions: Prisma.Sql[] = [Prisma.sql`asset.deleted_at IS NULL`, Prisma.sql`(${Prisma.join(keys.map((key) => fields[key as keyof typeof fields]), ' OR ')})`];
	for (const [field, column] of [['typeId', Prisma.sql`asset.type_id`], ['manufacturerId', Prisma.sql`asset.manufacturer_id`], ['statusId', Prisma.sql`asset.status_id`], ['storageId', Prisma.sql`asset.storage_id`]] as const) {
		const value = filterId(url, field);
		if (value) conditions.push(Prisma.sql`${column} = ${value}`);
	}
	const from = Prisma.sql`FROM it_assets asset
		JOIN it_asset_types type ON type.id = asset.type_id
		LEFT JOIN manufacturers manufacturer ON manufacturer.id = asset.manufacturer_id
		JOIN storage location ON location.id = asset.storage_id
		JOIN rooms room ON room.id = location.room_id
		JOIN branches branch ON branch.id = room.branch_id
		JOIN it_asset_statuses status ON status.id = asset.status_id
		LEFT JOIN LATERAL (
			SELECT employee.first_name, employee.middle_name, employee.last_name FROM it_asset_assignments assignment
			JOIN employees employee ON employee.id = assignment.employee_id
			WHERE assignment.asset_id = asset.id AND assignment.returned_at IS NULL AND assignment.deleted_at IS NULL
			ORDER BY assignment.assigned_at DESC LIMIT 1
		) assignee ON TRUE`;
	const where = Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`;
	const count = await tx.$queryRaw<Array<{ total: number }>>(Prisma.sql`SELECT count(*)::int AS total ${from} ${where}`);
	const orderFields: Record<SortField, Prisma.Sql> = {
		id: Prisma.sql`asset.id`, assetTag: Prisma.sql`asset.asset_tag`, type: Prisma.sql`type.name`, manufacturer: Prisma.sql`manufacturer.name`,
		modelNumber: Prisma.sql`asset.model_number`, serialNumber: Prisma.sql`asset.serial_number`, branch: Prisma.sql`branch.name`,
		room: Prisma.sql`room.name`, storage: Prisma.sql`location.name`, user: Prisma.sql`assignee.first_name`, status: Prisma.sql`status.name`,
		ramGb: Prisma.sql`asset.ram_gb`, purchasedOn: Prisma.sql`asset.purchased_on`, disposalOn: Prisma.sql`asset.disposal_on`,
		createdAt: Prisma.sql`asset.created_at`, updatedAt: Prisma.sql`asset.updated_at`
	};
	const direction = sortOrder === 'asc' ? Prisma.sql`ASC` : Prisma.sql`DESC`;
	const ordering = sortBy === 'manufacturer' ? Prisma.sql`manufacturer.name ${direction}, asset.model_number ${direction}`
		: sortBy === 'user' ? Prisma.sql`assignee.first_name ${direction} NULLS LAST, assignee.last_name ${direction} NULLS LAST`
		: Prisma.sql`${orderFields[sortBy]} ${direction} NULLS LAST`;
	const ordered = await tx.$queryRaw<Array<{ id: number }>>(Prisma.sql`SELECT asset.id ${from} ${where} ORDER BY ${ordering}, asset.id ASC OFFSET ${offset} LIMIT ${limit}`);
	const ids = ordered.map((row) => row.id);
	const records = await tx.itAsset.findMany({ where: { id: { in: ids } }, include: itAssetInclude });
	const byId = new Map(records.map((record) => [record.id, record]));
	return [count[0]?.total ?? 0, ids.flatMap((id) => byId.has(id) ? [byId.get(id)!] : [])] as const;
}
export async function GET({ locals, url }: import('./$types').RequestEvent) {
	requireOperationApi(locals.user, permissionOperations.assetRead); const query = parseListQuery(url, sortFields, 'assetTag'); const search = url.searchParams.get('q')?.trim();
	const visibleSearch = parseVisibleSearch(url, visibleSearchKeys);
	if (visibleSearch && search && search.length > 200) throwApiError(422, 'INVALID_SEARCH', 'q must be 200 characters or fewer for visible list search.', [{ field: 'q', reason: 'TOO_LONG' }]);
	const contains = search ? { contains: search, mode: 'insensitive' as const } : undefined;
	const where: Prisma.ItAssetWhereInput = {
		deletedAt: null,
		...(filterId(url, 'typeId') ? { typeId: filterId(url, 'typeId') } : {}),
		...(filterId(url, 'manufacturerId') ? { manufacturerId: filterId(url, 'manufacturerId') } : {}),
		...(filterId(url, 'statusId') ? { statusId: filterId(url, 'statusId') } : {}),
		...(filterId(url, 'storageId') ? { storageId: filterId(url, 'storageId') } : {}),
		...(contains ? { OR: [
			{ assetTag: contains }, { modelNumber: contains }, { serialNumber: contains }, { hostname: contains },
			{ adminUsername: contains }, { loginUsername: contains }, { managementConsoleUsername: contains },
			{ ipAddresses: { some: { deletedAt: null, ipAddress: contains } } }, { manufacturer: { name: contains } },
			{ type: { name: contains } }, { storage: { name: contains } }, { storage: { room: { name: contains } } },
			{ storage: { room: { branch: { name: contains } } } }, { status: { name: contains } },
			{ assignments: { some: { returnedAt: null, deletedAt: null, employee: { OR: [{ firstName: contains }, { lastName: contains }] } } } }
		] } : {})
	};
	const prisma = getPrisma();
	const [total, items] = await prisma.$transaction(async tx => {
		if (visibleSearch && search) return visibleAssetPage(tx, url, search, visibleSearch.keys, query.sortBy, query.sortOrder, query.offset, query.limit);
		const total = await tx.itAsset.count({ where });
		if (query.sortBy !== 'user') return [total, await tx.itAsset.findMany({ where, include: itAssetInclude, orderBy: assetOrderBy(query.sortBy, query.sortOrder), skip: query.offset, take: query.limit })] as const;
		const conditions: Prisma.Sql[] = [Prisma.sql`asset.deleted_at IS NULL`];
		for (const [field, column] of [['typeId', Prisma.sql`asset.type_id`], ['manufacturerId', Prisma.sql`asset.manufacturer_id`], ['statusId', Prisma.sql`asset.status_id`], ['storageId', Prisma.sql`asset.storage_id`]] as const) {
			const value = filterId(url, field);
			if (value) conditions.push(Prisma.sql`${column} = ${value}`);
		}
		if (search) {
			const pattern = `%${search}%`;
			conditions.push(Prisma.sql`(
				asset.asset_tag ILIKE ${pattern} OR asset.model_number ILIKE ${pattern} OR asset.serial_number ILIKE ${pattern}
				OR asset.hostname ILIKE ${pattern} OR asset.admin_username ILIKE ${pattern} OR asset.login_username ILIKE ${pattern}
				OR asset.management_console_username ILIKE ${pattern}
				OR EXISTS (SELECT 1 FROM it_asset_ip_addresses address_search WHERE address_search.asset_id = asset.id AND address_search.deleted_at IS NULL AND address_search.ip_address ILIKE ${pattern})
				OR manufacturer.name ILIKE ${pattern} OR type.name ILIKE ${pattern} OR location.name ILIKE ${pattern}
				OR room.name ILIKE ${pattern} OR branch.name ILIKE ${pattern} OR status.name ILIKE ${pattern}
				OR EXISTS (SELECT 1 FROM it_asset_assignments assignment_search JOIN employees employee_search ON employee_search.id = assignment_search.employee_id
					WHERE assignment_search.asset_id = asset.id AND assignment_search.returned_at IS NULL AND assignment_search.deleted_at IS NULL
					AND (employee_search.first_name ILIKE ${pattern} OR employee_search.last_name ILIKE ${pattern}))
			)`);
		}
		const direction = query.sortOrder === 'asc' ? Prisma.sql`ASC` : Prisma.sql`DESC`;
		const ordered = await tx.$queryRaw<Array<{ id: number }>>(Prisma.sql`
			SELECT asset.id FROM it_assets asset
			JOIN it_asset_types type ON type.id = asset.type_id
			LEFT JOIN manufacturers manufacturer ON manufacturer.id = asset.manufacturer_id
			JOIN storage location ON location.id = asset.storage_id
			JOIN rooms room ON room.id = location.room_id
			JOIN branches branch ON branch.id = room.branch_id
			JOIN it_asset_statuses status ON status.id = asset.status_id
			LEFT JOIN LATERAL (
				SELECT employee.last_name, employee.first_name FROM it_asset_assignments assignment
				JOIN employees employee ON employee.id = assignment.employee_id
				WHERE assignment.asset_id = asset.id AND assignment.returned_at IS NULL AND assignment.deleted_at IS NULL
				ORDER BY assignment.assigned_at DESC LIMIT 1
			) assignee ON TRUE
			WHERE ${Prisma.join(conditions, ' AND ')}
			ORDER BY assignee.first_name ${direction} NULLS LAST, assignee.last_name ${direction} NULLS LAST, asset.id ASC
			OFFSET ${query.offset} LIMIT ${query.limit}
		`);
		const rows = await tx.itAsset.findMany({ where: { id: { in: ordered.map(item => item.id) } }, include: itAssetInclude });
		const byId = new Map(rows.map(item => [item.id, item]));
		return [total, ordered.flatMap(item => { const asset = byId.get(item.id); return asset ? [asset] : []; })] as const;
	});
	return success(items.map(itAssetOutput), 200, listMeta(query, items.length, total));
}
export async function POST({ locals, request }: import('./$types').RequestEvent) {
	const actor = requireAssetWriteApi(locals.user);
	const body = await request.json().catch(() => null);
	const parsed = parseItAssetInput(body);
	const credentialInput = parseCredentialChanges(body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>).credentials : undefined);
	if (Object.keys(credentialInput.changes).length) requireAssetCredentialWriteApi(locals.user);
	const data = parsed.data;
	if (!data || credentialInput.details.length) return failure(400, 'VALIDATION_ERROR', 'Invalid IT asset input.', [...parsed.details, ...credentialInput.details]);
	try {
		const item = await getPrisma().$transaction(async tx => {
			const details = await itAssetReferenceErrors(tx, data);
			if (details.length) throw new ItAssetValidationError(details);
			const assetTag = await resolveManagementCode(tx, data.typeId, parsed.assetTag);
			const created = await tx.itAsset.create({ data: { ...data, assetTag } });
			await reserveManagementCode(tx, created.id, assetTag);
			await syncAssetIpAddresses(tx, created.id, data.storageId, parsed.ipAddresses);
			await applyCredentialChanges(tx, created.id, actor.id, credentialInput.changes);
			await changeAssignee(tx, created.id, parsed.assigneeId, actor.id);
			await recordAssetChange(tx, created.id, actor.id, 'create', null, await readAssetFields(tx, created.id));
			await writeAuditLog(tx, actor.id, 'create', 'it_asset', created.id);
			return tx.itAsset.findUniqueOrThrow({ where: { id: created.id }, include: itAssetInclude });
		}, { isolationLevel: 'ReadCommitted' });
		return success(itAssetOutput(item), 201);
	} catch (error) {
		const response = itAssetErrorResponse(error);
		if (response) return response;
		throw error;
	}
}
