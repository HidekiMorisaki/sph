import { requireOperationApi } from '$lib/server/api/admin';
import { permissionOperations } from '$lib/server/auth/permissions';
import { parseId } from '$lib/server/api/database';
import { bodyObject, dateInput, fieldsOnly, optionalText, recordSoftwareChange } from '$lib/server/api/software';
import { failure, success } from '$lib/server/api/response';
import { getPrisma } from '$lib/server/prisma';

export async function PATCH({ locals, params, request }: import('./$types').RequestEvent) {
	const actor = requireOperationApi(locals.user, permissionOperations.softwareManage);
	const contractId = parseId(params.id);
	const assignmentId = parseId(params.assignmentId);
	if (!contractId || !assignmentId) return failure(404, 'NOT_FOUND', 'Not found.');
	const body = bodyObject(await request.json().catch(() => null));
	fieldsOnly(body, ['releasedOn', 'releaseReason', 'deactivatedOn']);
	const releasedOn = dateInput(body.releasedOn, 'releasedOn')!;
	const deactivatedOn = dateInput(body.deactivatedOn, 'deactivatedOn', true);
	const reason = optionalText(body.releaseReason, 'releaseReason', 1000);
	const today = new Date();
	const todayDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
	if (releasedOn > todayDate || (deactivatedOn && (deactivatedOn < releasedOn || deactivatedOn > todayDate))) return failure(422, 'INVALID_DATE_RANGE', 'Release dates are inconsistent.');
	const result = await getPrisma().$transaction(async tx => {
		await tx.$queryRaw`SELECT id FROM software_contracts WHERE id = ${contractId} AND deleted_at IS NULL FOR UPDATE`;
		const item = await tx.softwareAssignment.findFirst({ where: { id: assignmentId, contractId, releasedOn: null, deletedAt: null, contract: { deletedAt: null } } });
		if (!item) return null;
		if (releasedOn < item.assignedOn) return false;
		const updated = await tx.softwareAssignment.update({ where: { id: assignmentId }, data: { releasedOn, releaseReason: reason, deactivatedOn } });
		await recordSoftwareChange(tx, actor.id, 'software_contract', contractId, 'release', { assignmentNo: item.assignmentNo, releasedOn: releasedOn.toISOString().slice(0, 10), releaseReason: reason, deactivatedOn: deactivatedOn?.toISOString().slice(0, 10) ?? null });
		return updated;
	});
	return result === null ? failure(404, 'NOT_FOUND', 'Not found.') : result === false ? failure(422, 'INVALID_DATE_RANGE', 'Release precedes assignment.') : success(result);
}
