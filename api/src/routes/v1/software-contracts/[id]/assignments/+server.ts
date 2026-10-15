import { requireOperationApi } from '$lib/server/api/admin';
import { permissionOperations } from '$lib/server/auth/permissions';
import { parseBodyId, parseId } from '$lib/server/api/database';
import { bodyObject, dateInput, fieldsOnly, optionalText, recordSoftwareChange } from '$lib/server/api/software';
import { listMeta, parseListQuery } from '$lib/server/api/query';
import { failure, success } from '$lib/server/api/response';
import { getPrisma } from '$lib/server/prisma';

export async function GET({ locals, params, url }: import('./$types').RequestEvent) {
	requireOperationApi(locals.user, permissionOperations.softwareRead);
	const contractId = parseId(params.id);
	if (!contractId || !await getPrisma().softwareContract.count({ where: { id: contractId, deletedAt: null, product: { deletedAt: null } } })) return failure(404, 'NOT_FOUND', 'Not found.');
	const query = parseListQuery(url, ['assignedOn', 'assignmentNo', 'releasedOn'] as const, 'assignedOn');
	const where = { contractId, deletedAt: null };
	const [items, total] = await Promise.all([
		getPrisma().softwareAssignment.findMany({ where, orderBy: [{ [query.sortBy]: query.sortOrder }, { id: 'asc' }], skip: query.offset, take: query.limit, select: { id: true, assignmentNo: true, employeeId: true, assetId: true, keyId: true, assignedOn: true, plannedReleaseOn: true, releasedOn: true, releaseReason: true, deactivatedOn: true, notes: true, employee: { select: { id: true, employeeCode: true, firstName: true, middleName: true, lastName: true } }, asset: { select: { id: true, assetTag: true } } } }),
		getPrisma().softwareAssignment.count({ where })
	]);
	return success(items, 200, listMeta(query, items.length, total));
}

export async function POST({ locals, params, request }: import('./$types').RequestEvent) {
	const actor = requireOperationApi(locals.user, permissionOperations.softwareManage);
	const contractId = parseId(params.id);
	if (!contractId) return failure(404, 'NOT_FOUND', 'Not found.');
	const body = bodyObject(await request.json().catch(() => null));
	fieldsOnly(body, ['employeeId', 'assetId', 'keyId', 'assignedOn', 'plannedReleaseOn', 'notes']);
	const employeeId = body.employeeId == null ? null : parseBodyId(body.employeeId);
	const assetId = body.assetId == null ? null : parseBodyId(body.assetId);
	const keyId = body.keyId == null ? null : parseBodyId(body.keyId);
	if ((employeeId === null) === (assetId === null) || (body.employeeId != null && !employeeId) || (body.assetId != null && !assetId) || (body.keyId != null && !keyId)) return failure(422, 'INVALID_TARGET', 'Select one valid assignment target.');
	const assignedOn = dateInput(body.assignedOn, 'assignedOn')!;
	const plannedReleaseOn = dateInput(body.plannedReleaseOn, 'plannedReleaseOn', true);
	const today = new Date();
	const todayDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
	if (assignedOn > todayDate || (plannedReleaseOn && plannedReleaseOn < assignedOn)) return failure(422, 'INVALID_DATE_RANGE', 'Assignment dates are inconsistent.');
	const notes = optionalText(body.notes, 'notes', 5000);
	const result = await getPrisma().$transaction(async tx => {
		const locked = await tx.$queryRaw<Array<{ id: number }>>`SELECT id FROM software_contracts WHERE id = ${contractId} AND deleted_at IS NULL FOR UPDATE`;
		if (!locked.length) return { state: 'missing' as const };
		const contract = await tx.softwareContract.findFirst({ where: { id: contractId, product: { deletedAt: null } }, include: { terms: true } });
		if (!contract) return { state: 'missing' as const };
		if (contract.licenseType === 'concurrent') return { state: 'unsupported' as const };
		if (contract.startsOn > todayDate || (contract.endsOn && contract.endsOn < todayDate) || assignedOn < contract.startsOn) return { state: 'expired' as const };
		if ((contract.licenseType === 'user') !== (employeeId !== null)) return { state: 'target_type' as const };
		if (employeeId && !await tx.employee.count({ where: { id: employeeId, deletedAt: null, OR: [{ retiredAt: null }, { retiredAt: { gt: todayDate } }] } })) return { state: 'target_missing' as const };
		if (assetId && !await tx.itAsset.count({ where: { id: assetId, deletedAt: null } })) return { state: 'target_missing' as const };
		if (keyId && !await tx.softwareLicenseKey.count({ where: { id: keyId, contractId, deletedAt: null } })) return { state: 'key_missing' as const };
		if (await tx.softwareAssignment.count({ where: { contractId, releasedOn: null, deletedAt: null, ...(employeeId ? { employeeId } : { assetId }) } })) return { state: 'duplicate' as const };
		const capacity = contract.licenseType === 'user' ? contract.purchasedQuantity * (contract.terms?.usersPerLicense ?? 0) : contract.purchasedQuantity;
		const occupied = await tx.softwareAssignment.count({ where: { contractId, releasedOn: null, deletedAt: null } });
		if (occupied >= capacity) return { state: 'full' as const };
		const latest = await tx.softwareAssignment.aggregate({ where: { contractId }, _max: { assignmentNo: true } });
		const item = await tx.softwareAssignment.create({ data: { contractId, employeeId, assetId, keyId, assignedOn, plannedReleaseOn, notes, assignmentNo: (latest._max.assignmentNo ?? 0) + 1 } });
		await recordSoftwareChange(tx, actor.id, 'software_contract', contractId, 'assign', { assignmentNo: item.assignmentNo, employeeId, assetId, keyId, assignedOn: assignedOn.toISOString().slice(0, 10) });
		return { state: 'ok' as const, item };
	}, { isolationLevel: 'ReadCommitted' });
	return result.state === 'ok' ? success(result.item, 201) : result.state === 'missing' ? failure(404, 'NOT_FOUND', 'Not found.') : result.state === 'target_missing' || result.state === 'key_missing' ? failure(422, 'INVALID_REFERENCE', 'The target or key is unavailable.') : failure(409, 'ASSIGNMENT_CONFLICT', 'The assignment conflicts with the contract or its capacity.');
}
