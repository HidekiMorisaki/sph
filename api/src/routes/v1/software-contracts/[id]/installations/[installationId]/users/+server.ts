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
	const installationId = parseId(params.installationId);
	if (!contractId || !installationId || !await getPrisma().softwareInstallation.count({ where: { id: installationId, contractId, deletedAt: null, contract: { deletedAt: null, product: { deletedAt: null } } } })) return failure(404, 'NOT_FOUND', 'Not found.');
	const query = parseListQuery(url, ['usageNo', 'startedOn', 'endedOn'] as const, 'startedOn');
	const search = url.searchParams.get('q')?.trim() ?? '';
	if (search.length > 255) return failure(422, 'INVALID_SEARCH', 'Search is too long.');
	const where = { installationId, deletedAt: null, ...(search ? { employee: { OR: [{ employeeCode: { contains: search, mode: 'insensitive' as const } }, { firstName: { contains: search, mode: 'insensitive' as const } }, { lastName: { contains: search, mode: 'insensitive' as const } }] } } : {}) };
	const [items, total] = await Promise.all([
		getPrisma().softwareInstallationUser.findMany({ where, orderBy: [{ [query.sortBy]: query.sortOrder }, { id: 'asc' }], skip: query.offset, take: query.limit, select: { id: true, employeeId: true, usageNo: true, startedOn: true, endedOn: true, notes: true, employee: { select: { id: true, employeeCode: true, firstName: true, middleName: true, lastName: true } } } }),
		getPrisma().softwareInstallationUser.count({ where })
	]);
	return success(items, 200, listMeta(query, items.length, total));
}

export async function POST({ locals, params, request }: import('./$types').RequestEvent) {
	const actor = requireOperationApi(locals.user, permissionOperations.softwareManage);
	const contractId = parseId(params.id);
	const installationId = parseId(params.installationId);
	if (!contractId || !installationId) return failure(404, 'NOT_FOUND', 'Not found.');
	const body = bodyObject(await request.json().catch(() => null));
	fieldsOnly(body, ['employeeId', 'startedOn', 'notes']);
	const employeeId = parseBodyId(body.employeeId);
	if (!employeeId) return failure(422, 'INVALID_EMPLOYEE', 'Select an active employee.');
	const startedOn = dateInput(body.startedOn, 'startedOn')!;
	const today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z');
	if (startedOn > today) return failure(422, 'INVALID_DATE_RANGE', 'Usage start cannot be in the future.');
	const notes = optionalText(body.notes, 'notes', 5000);
	try {
		const result = await getPrisma().$transaction(async tx => {
			const locked = await tx.$queryRaw<Array<{ id: number }>>`SELECT id FROM software_installations WHERE id = ${installationId} AND contract_id = ${contractId} AND deleted_at IS NULL FOR UPDATE`;
			if (!locked.length) return { state: 'missing' as const };
			const installation = await tx.softwareInstallation.findFirst({ where: { id: installationId, contractId, deletedAt: null, contract: { deletedAt: null, product: { deletedAt: null } } }, select: { installedOn: true, removedOn: true, installationNo: true } });
			if (!installation) return { state: 'missing' as const };
			if (installation.removedOn) return { state: 'ended' as const };
			if (startedOn < installation.installedOn) return { state: 'dates' as const };
			if (!await tx.employee.count({ where: { id: employeeId, deletedAt: null, OR: [{ retiredAt: null }, { retiredAt: { gt: today } }] } })) return { state: 'employee_missing' as const };
			if (await tx.softwareInstallationUser.count({ where: { installationId, employeeId, endedOn: null, deletedAt: null } })) return { state: 'duplicate' as const };
			const previous = await tx.softwareInstallationUser.aggregate({ where: { installationId, employeeId, deletedAt: null }, _max: { endedOn: true } });
			if (previous._max.endedOn && startedOn < previous._max.endedOn) return { state: 'dates' as const };
			const latest = await tx.softwareInstallationUser.aggregate({ where: { installationId }, _max: { usageNo: true } });
			const item = await tx.softwareInstallationUser.create({ data: { installationId, employeeId, usageNo: (latest._max.usageNo ?? 0) + 1, startedOn, notes } });
			await recordSoftwareChange(tx, actor.id, 'software_contract', contractId, 'record_usage', { installationNo: installation.installationNo, usageNo: item.usageNo, employeeId, startedOn: startedOn.toISOString().slice(0, 10) });
			return { state: 'ok' as const, item };
		});
		return result.state === 'ok' ? success(result.item, 201) : result.state === 'missing' ? failure(404, 'NOT_FOUND', 'Not found.') : result.state === 'employee_missing' ? failure(422, 'INVALID_EMPLOYEE', 'Select an active employee.') : result.state === 'dates' ? failure(422, 'INVALID_DATE_RANGE', 'Usage starts before installation.') : failure(409, 'USAGE_CONFLICT', 'Usage conflicts with the installation.');
	} catch (error) {
		if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') return failure(409, 'USAGE_CONFLICT', 'Active usage already exists.');
		throw error;
	}
}
