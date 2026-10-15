import { requireOperationApi } from '$lib/server/api/admin';
import { permissionOperations } from '$lib/server/auth/permissions';
import { parseId } from '$lib/server/api/database';
import { bodyObject, contractInput, contractMetrics, recordSoftwareChange } from '$lib/server/api/software';
import { failure, success } from '$lib/server/api/response';
import { getPrisma } from '$lib/server/prisma';

export async function GET({ locals, params }: import('./$types').RequestEvent) {
	requireOperationApi(locals.user, permissionOperations.softwareRead);
	const id = parseId(params.id);
	if (!id) return failure(404, 'NOT_FOUND', 'Not found.');
	const item = await getPrisma().softwareContract.findFirst({ where: { id, deletedAt: null, product: { deletedAt: null } }, include: { product: { select: { id: true, name: true, manufacturer: true, edition: true, version: true } }, terms: true, assignments: { where: { deletedAt: null, releasedOn: null }, select: { employeeId: true, assetId: true, releasedOn: true, employee: { select: { deletedAt: true, retiredAt: true } }, asset: { select: { deletedAt: true } } } }, installations: { where: { deletedAt: null, removedOn: null }, select: { assetId: true, asset: { select: { deletedAt: true } }, users: { where: { deletedAt: null, endedOn: null }, select: { employeeId: true, employee: { select: { deletedAt: true, retiredAt: true } } } } } } } });
	if (!item) return failure(404, 'NOT_FOUND', 'Not found.');
	const { assignments, installations, ...fields } = item;
	return success({ ...fields, metrics: contractMetrics({ ...fields, assignments, installations }) });
}

export async function PATCH({ locals, params, request }: import('./$types').RequestEvent) {
	const actor = requireOperationApi(locals.user, permissionOperations.softwareManage);
	const id = parseId(params.id);
	if (!id) return failure(404, 'NOT_FOUND', 'Not found.');
	const { contract, terms } = contractInput(bodyObject(await request.json().catch(() => null)));
	try {
		const result = await getPrisma().$transaction(async tx => {
			await tx.$queryRaw`SELECT id FROM software_contracts WHERE id = ${id} AND deleted_at IS NULL FOR UPDATE`;
			const before = await tx.softwareContract.findFirst({ where: { id, deletedAt: null, product: { deletedAt: null } }, include: { terms: true } });
			if (!before) return { state: 'missing' as const };
			await tx.$queryRaw`SELECT id FROM software_products WHERE id = ${contract.productId} AND deleted_at IS NULL FOR UPDATE`;
			if (!await tx.softwareProduct.count({ where: { id: contract.productId, deletedAt: null } })) return { state: 'invalid_product' as const };
			const assigned = await tx.softwareAssignment.count({ where: { contractId: id, releasedOn: null, deletedAt: null } });
			const observations = await tx.softwareInstallation.count({ where: { contractId: id, deletedAt: null } });
			const capacity = contract.licenseType === 'user' ? contract.purchasedQuantity * (terms.usersPerLicense ?? 0) : contract.purchasedQuantity;
			if (assigned && (contract.licenseType !== before.licenseType || contract.productId !== before.productId || capacity < assigned) || observations && (contract.licenseType !== before.licenseType || contract.productId !== before.productId)) return { state: 'in_use' as const };
			const item = await tx.softwareContract.update({ where: { id }, data: { ...contract, terms: { update: terms } }, include: { terms: true } });
			await recordSoftwareChange(tx, actor.id, 'software_contract', id, 'update', { before: { reference: before.reference, licenseType: before.licenseType, purchasedQuantity: before.purchasedQuantity, startsOn: before.startsOn.toISOString().slice(0, 10), endsOn: before.endsOn?.toISOString().slice(0, 10), renewsOn: before.renewsOn?.toISOString().slice(0, 10), terms: before.terms && { usersPerLicense: before.terms.usersPerLicense, devicesPerUser: before.terms.devicesPerUser, usersPerDevice: before.terms.usersPerDevice, evidenceStatus: before.terms.evidenceStatus } }, after: { reference: contract.reference, licenseType: contract.licenseType, purchasedQuantity: contract.purchasedQuantity, startsOn: contract.startsOn.toISOString().slice(0, 10), endsOn: contract.endsOn?.toISOString().slice(0, 10), renewsOn: contract.renewsOn?.toISOString().slice(0, 10), terms } });
			return { state: 'ok' as const, item };
		});
		return result.state === 'ok' ? success(result.item) : result.state === 'in_use' ? failure(409, 'CONTRACT_IN_USE', 'Existing assignments conflict with the changed terms.') : result.state === 'invalid_product' ? failure(422, 'INVALID_PRODUCT', 'The product is unavailable.') : failure(404, 'NOT_FOUND', 'Not found.');
	} catch (error) {
		if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') return failure(409, 'DUPLICATE_CONTRACT', 'This contract already exists.');
		throw error;
	}
}

export async function DELETE({ locals, params }: import('./$types').RequestEvent) {
	const actor = requireOperationApi(locals.user, permissionOperations.softwareManage);
	const id = parseId(params.id);
	if (!id) return failure(404, 'NOT_FOUND', 'Not found.');
	const result = await getPrisma().$transaction(async tx => {
		const locked = await tx.$queryRaw<Array<{ id: number }>>`SELECT id FROM software_contracts WHERE id = ${id} AND deleted_at IS NULL FOR UPDATE`;
		if (!locked.length) return 'not_found';
		if (await tx.softwareAssignment.count({ where: { contractId: id, releasedOn: null, deletedAt: null } }) ||
			await tx.softwareInstallation.count({ where: { contractId: id, removedOn: null, deletedAt: null } })) return 'in_use';
		const before = await tx.softwareContract.findUniqueOrThrow({ where: { id }, select: { reference: true, productId: true } });
		const deletedAt = new Date();
		await tx.softwareLicenseTerms.updateMany({ where: { contractId: id, deletedAt: null }, data: { deletedAt } });
		await tx.softwareLicenseKey.updateMany({ where: { contractId: id, deletedAt: null }, data: { deletedAt } });
		await tx.softwareContract.update({ where: { id }, data: { deletedAt } });
		await recordSoftwareChange(tx, actor.id, 'software_contract', id, 'delete', { before, after: null });
		return 'deleted';
	});
	return result === 'in_use' ? failure(409, 'RESOURCE_IN_USE', 'The contract has active assignments or installations.') : result === 'not_found' ? failure(404, 'NOT_FOUND', 'Not found.') : success({ id, deleted: true });
}
