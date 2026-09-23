import { requireAssetWriteApi, requireAuthenticatedApi, writeAuditLog } from '$lib/server/api/admin';
import { itAssetInclude, itAssetReferenceErrors, parseItAssetInput } from '$lib/server/api/it-asset-input';
import { allocateManagementCode } from '$lib/server/api/it-asset-management-code';
import { ItAssetValidationError, itAssetErrorResponse } from '$lib/server/api/it-asset-errors';
import { changeAssignee, readAssetFields, recordAssetChange } from '$lib/server/api/it-asset-history';
import { listMeta, parseListQuery } from '$lib/server/api/query';
import { failure, success } from '$lib/server/api/response';
import { Prisma } from '$lib/server/generated/prisma/client';
import { getPrisma } from '$lib/server/prisma';

const sortFields = ['id', 'assetTag', 'type', 'manufacturer', 'modelNumber', 'serialNumber', 'branch', 'room', 'storageLocation', 'user', 'status', 'ramGb', 'purchasedOn', 'disposalOn', 'createdAt', 'updatedAt'] as const;
type SortField = (typeof sortFields)[number];
function assetOrderBy(field: SortField, direction: 'asc' | 'desc'): Prisma.ItAssetOrderByWithRelationInput[] {
	switch (field) {
		case 'type': return [{ type: { name: direction } }, { id: 'asc' }];
		case 'manufacturer': return [{ manufacturer: { name: direction } }, { modelNumber: direction }, { id: 'asc' }];
		case 'branch': return [{ location: { room: { branch: { name: direction } } } }, { id: 'asc' }];
		case 'room': return [{ location: { room: { name: direction } } }, { id: 'asc' }];
		case 'storageLocation': return [{ location: { name: direction } }, { id: 'asc' }];
		case 'status': return [{ status: { name: direction } }, { id: 'asc' }];
		default: return [{ [field]: direction }, { id: 'asc' }];
	}
}
const filterId = (url: URL, key: string) => { const raw = url.searchParams.get(key); return raw && /^\d+$/.test(raw) ? Number(raw) : undefined; };
export async function GET({ locals, url }: import('./$types').RequestEvent) {
	requireAuthenticatedApi(locals.user); const query = parseListQuery(url, sortFields, 'assetTag'); const search = url.searchParams.get('q')?.trim();
	const contains = search ? { contains: search, mode: 'insensitive' as const } : undefined;
	const where: Prisma.ItAssetWhereInput = { deletedAt: null, ...(filterId(url, 'typeId') ? { typeId: filterId(url, 'typeId') } : {}), ...(filterId(url, 'manufacturerId') ? { manufacturerId: filterId(url, 'manufacturerId') } : {}), ...(filterId(url, 'statusId') ? { statusId: filterId(url, 'statusId') } : {}), ...(filterId(url, 'locationId') ? { locationId: filterId(url, 'locationId') } : {}), ...(contains ? { OR: [{ assetTag: contains }, { modelNumber: contains }, { serialNumber: contains }, { manufacturer: { name: contains } }, { type: { name: contains } }, { location: { name: contains } }, { location: { room: { name: contains } } }, { location: { room: { branch: { name: contains } } } }, { status: { name: contains } }, { assignments: { some: { returnedAt: null, deletedAt: null, employee: { OR: [{ firstName: contains }, { lastName: contains }] } } } }] } : {}) };
	const prisma = getPrisma();
	const [total, items] = await prisma.$transaction(async tx => {
		const total = await tx.itAsset.count({ where });
		if (query.sortBy !== 'user') return [total, await tx.itAsset.findMany({ where, include: itAssetInclude, orderBy: assetOrderBy(query.sortBy, query.sortOrder), skip: query.offset, take: query.limit })] as const;
		const conditions: Prisma.Sql[] = [Prisma.sql`asset.deleted_at IS NULL`];
		for (const [field, column] of [['typeId', Prisma.sql`asset.type_id`], ['manufacturerId', Prisma.sql`asset.manufacturer_id`], ['statusId', Prisma.sql`asset.status_id`], ['locationId', Prisma.sql`asset.location_id`]] as const) {
			const value = filterId(url, field);
			if (value) conditions.push(Prisma.sql`${column} = ${value}`);
		}
		if (search) {
			const pattern = `%${search}%`;
			conditions.push(Prisma.sql`(
				asset.asset_tag ILIKE ${pattern} OR asset.model_number ILIKE ${pattern} OR asset.serial_number ILIKE ${pattern}
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
			JOIN storage_locations location ON location.id = asset.location_id
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
	return success(items, 200, listMeta(query, items.length, total));
}
export async function POST({ locals, request }: import('./$types').RequestEvent) {
	const actor = requireAssetWriteApi(locals.user);
	const parsed = parseItAssetInput(await request.json().catch(() => null));
	const data = parsed.data;
	if (!data) return failure(400, 'VALIDATION_ERROR', 'Invalid IT asset input.', parsed.details);
	try {
		const item = await getPrisma().$transaction(async tx => {
			const details = await itAssetReferenceErrors(tx, data);
			if (details.length) throw new ItAssetValidationError(details);
			const assetTag = await allocateManagementCode(tx, data.typeId);
			const created = await tx.itAsset.create({ data: { ...data, assetTag } });
			await changeAssignee(tx, created.id, parsed.assigneeId, actor.id);
			await recordAssetChange(tx, created.id, actor.id, 'create', null, await readAssetFields(tx, created.id));
			await writeAuditLog(tx, actor.id, 'create', 'it_asset', created.id);
			return tx.itAsset.findUniqueOrThrow({ where: { id: created.id }, include: itAssetInclude });
		}, { isolationLevel: 'ReadCommitted' });
		return success(item, 201);
	} catch (error) {
		const response = itAssetErrorResponse(error);
		if (response) return response;
		throw error;
	}
}
