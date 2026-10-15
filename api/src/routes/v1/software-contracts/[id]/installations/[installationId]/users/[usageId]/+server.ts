import { requireOperationApi } from '$lib/server/api/admin';
import { permissionOperations } from '$lib/server/auth/permissions';
import { parseId } from '$lib/server/api/database';
import { bodyObject, dateInput, fieldsOnly, recordSoftwareChange } from '$lib/server/api/software';
import { failure, success } from '$lib/server/api/response';
import { getPrisma } from '$lib/server/prisma';

export async function PATCH({ locals, params, request }: import('./$types').RequestEvent) {
	const actor = requireOperationApi(locals.user, permissionOperations.softwareManage);
	const contractId = parseId(params.id);
	const installationId = parseId(params.installationId);
	const usageId = parseId(params.usageId);
	if (!contractId || !installationId || !usageId) return failure(404, 'NOT_FOUND', 'Not found.');
	const body = bodyObject(await request.json().catch(() => null));
	fieldsOnly(body, ['endedOn']);
	const endedOn = dateInput(body.endedOn, 'endedOn')!;
	const today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z');
	if (endedOn > today) return failure(422, 'INVALID_DATE_RANGE', 'Usage end cannot be in the future.');
	const result = await getPrisma().$transaction(async tx => {
		const locked = await tx.$queryRaw<Array<{ id: number }>>`SELECT id FROM software_installations WHERE id = ${installationId} AND contract_id = ${contractId} AND deleted_at IS NULL FOR UPDATE`;
		if (!locked.length) return { state: 'missing' as const };
		const item = await tx.softwareInstallationUser.findFirst({ where: { id: usageId, installationId, deletedAt: null, installation: { contractId, deletedAt: null, contract: { deletedAt: null, product: { deletedAt: null } } } }, select: { id: true, employeeId: true, usageNo: true, startedOn: true, endedOn: true, installation: { select: { installationNo: true, removedOn: true } } } });
		if (!item) return { state: 'missing' as const };
		if (item.endedOn) return { state: 'ended' as const };
		if (endedOn < item.startedOn || (item.installation.removedOn && endedOn > item.installation.removedOn)) return { state: 'dates' as const };
		const updated = await tx.softwareInstallationUser.update({ where: { id: usageId }, data: { endedOn } });
		await recordSoftwareChange(tx, actor.id, 'software_contract', contractId, 'end_usage', { installationNo: item.installation.installationNo, usageNo: item.usageNo, employeeId: item.employeeId, endedOn: endedOn.toISOString().slice(0, 10) });
		return { state: 'ok' as const, item: updated };
	});
	return result.state === 'ok' ? success(result.item) : result.state === 'missing' ? failure(404, 'NOT_FOUND', 'Not found.') : result.state === 'dates' ? failure(422, 'INVALID_DATE_RANGE', 'Usage end precedes its start.') : failure(409, 'USAGE_ENDED', 'Usage is already ended.');
}
