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
	if (!contractId || !installationId) return failure(404, 'NOT_FOUND', 'Not found.');
	const body = bodyObject(await request.json().catch(() => null));
	fieldsOnly(body, ['removedOn']);
	const removedOn = dateInput(body.removedOn, 'removedOn')!;
	const today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z');
	if (removedOn > today) return failure(422, 'INVALID_DATE_RANGE', 'Removal date cannot be in the future.');
	const result = await getPrisma().$transaction(async tx => {
		const locked = await tx.$queryRaw<Array<{ id: number }>>`SELECT id FROM software_installations WHERE id = ${installationId} AND contract_id = ${contractId} AND deleted_at IS NULL FOR UPDATE`;
		if (!locked.length) return { state: 'missing' as const };
		const item = await tx.softwareInstallation.findFirst({ where: { id: installationId, contractId, deletedAt: null, contract: { deletedAt: null, product: { deletedAt: null } } }, include: { users: { where: { endedOn: null, deletedAt: null }, select: { id: true, startedOn: true } } } });
		if (!item) return { state: 'missing' as const };
		if (item.removedOn) return { state: 'ended' as const };
		if (removedOn < item.installedOn || item.users.some(user => user.startedOn > removedOn)) return { state: 'dates' as const };
		await tx.softwareInstallationUser.updateMany({ where: { installationId, endedOn: null, deletedAt: null }, data: { endedOn: removedOn } });
		const updated = await tx.softwareInstallation.update({ where: { id: installationId }, data: { removedOn } });
		await recordSoftwareChange(tx, actor.id, 'software_contract', contractId, 'remove_installation', { installationNo: item.installationNo, assetId: item.assetId, removedOn: removedOn.toISOString().slice(0, 10), endedUsers: item.users.length });
		return { state: 'ok' as const, item: updated };
	});
	return result.state === 'ok' ? success(result.item) : result.state === 'missing' ? failure(404, 'NOT_FOUND', 'Not found.') : result.state === 'dates' ? failure(422, 'INVALID_DATE_RANGE', 'Removal precedes the installation or a usage record.') : failure(409, 'INSTALLATION_ENDED', 'Installation is already ended.');
}
