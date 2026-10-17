import { requireOperationApi } from '$lib/server/api/admin';
import { permissionOperations } from '$lib/server/auth/permissions';
import { parseBodyId, parseId } from '$lib/server/api/database';
import { bodyObject, dateInput, fieldsOnly, optionalText, recordSoftwareChange } from '$lib/server/api/software';
import { listMeta, parseListQuery } from '$lib/server/api/query';
import { failure, success } from '$lib/server/api/response';
import { getPrisma } from '$lib/server/prisma';

const day = () => new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z');

export async function GET({ locals, params, url }: import('./$types').RequestEvent) {
	requireOperationApi(locals.user, permissionOperations.softwareRead);
	const contractId = parseId(params.id);
	if (!contractId || !await getPrisma().softwareContract.count({ where: { id: contractId, deletedAt: null, product: { deletedAt: null } } })) return failure(404, 'NOT_FOUND', 'Not found.');
	const query = parseListQuery(url, ['installationNo', 'installedOn', 'removedOn'] as const, 'installedOn');
	const search = url.searchParams.get('q')?.trim() ?? '';
	if (search.length > 255) return failure(422, 'INVALID_SEARCH', 'Search is too long.');
	const where = { contractId, deletedAt: null, ...(search ? { asset: { assetTag: { contains: search, mode: 'insensitive' as const } } } : {}) };
	const [items, total] = await Promise.all([
		getPrisma().softwareInstallation.findMany({ where, orderBy: [{ [query.sortBy]: query.sortOrder }, { id: 'asc' }], skip: query.offset, take: query.limit, select: { id: true, contractId: true, assetId: true, installationNo: true, installedOn: true, removedOn: true, notes: true, asset: { select: { id: true, assetTag: true, deletedAt: true } }, _count: { select: { users: { where: { deletedAt: null, endedOn: null } } } } } }),
		getPrisma().softwareInstallation.count({ where })
	]);
	return success(items, 200, listMeta(query, items.length, total));
}

export async function POST({ locals, params, request }: import('./$types').RequestEvent) {
	const actor = requireOperationApi(locals.user, permissionOperations.softwareManage);
	const contractId = parseId(params.id);
	if (!contractId) return failure(404, 'NOT_FOUND', 'Not found.');
	const body = bodyObject(await request.json().catch(() => null));
	fieldsOnly(body, ['assetId', 'installedOn', 'notes']);
	const assetId = parseBodyId(body.assetId);
	if (!assetId) return failure(422, 'INVALID_ASSET', 'Select an active IT asset.');
	const installedOn = dateInput(body.installedOn, 'installedOn')!;
	if (installedOn > day()) return failure(422, 'INVALID_DATE_RANGE', 'Installation date cannot be in the future.');
	const notes = optionalText(body.notes, 'notes', 5000);
	try {
		const result = await getPrisma().$transaction(async tx => {
			const locked = await tx.$queryRaw<Array<{ id: number }>>`SELECT id FROM software_contracts WHERE id = ${contractId} AND deleted_at IS NULL FOR UPDATE`;
			if (!locked.length) return { state: 'missing' as const };
			const contract = await tx.softwareContract.findFirst({ where: { id: contractId, product: { deletedAt: null } }, select: { licenseType: true } });
			if (!contract) return { state: 'missing' as const };
			if (contract.licenseType === 'concurrent') return { state: 'unsupported' as const };
			if (!await tx.itAsset.count({ where: { id: assetId, deletedAt: null } })) return { state: 'asset_missing' as const };
			if (await tx.softwareInstallation.count({ where: { contractId, assetId, removedOn: null, deletedAt: null } })) return { state: 'duplicate' as const };
			const previous = await tx.softwareInstallation.aggregate({ where: { contractId, assetId, deletedAt: null }, _max: { removedOn: true } });
			if (previous._max.removedOn && installedOn < previous._max.removedOn) return { state: 'dates' as const };
			const latest = await tx.softwareInstallation.aggregate({ where: { contractId }, _max: { installationNo: true } });
			const item = await tx.softwareInstallation.create({ data: { contractId, assetId, installationNo: (latest._max.installationNo ?? 0) + 1, installedOn, notes } });
			await recordSoftwareChange(tx, actor.id, 'software_contract', contractId, 'install', { installationNo: item.installationNo, assetId, installedOn: installedOn.toISOString().slice(0, 10) });
			return { state: 'ok' as const, item };
		});
		return result.state === 'ok' ? success(result.item, 201) : result.state === 'missing' ? failure(404, 'NOT_FOUND', 'Not found.') : result.state === 'asset_missing' ? failure(422, 'INVALID_ASSET', 'Select an active IT asset.') : result.state === 'dates' ? failure(422, 'INVALID_DATE_RANGE', 'Installation overlaps an earlier record.') : failure(409, 'INSTALLATION_CONFLICT', 'The installation conflicts with this contract.');
	} catch (error) {
		if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') return failure(409, 'INSTALLATION_CONFLICT', 'An active installation already exists.');
		throw error;
	}
}
