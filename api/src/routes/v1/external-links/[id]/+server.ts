import { requireSystemAdminApi, writeAuditLog } from '$lib/server/api/admin';
import { duplicateField, parseId } from '$lib/server/api/database';
import { parseExternalLinkInput } from '$lib/server/api/external-link-input';
import { failure, success } from '$lib/server/api/response';
import { getPrisma } from '$lib/server/prisma';

const select = { id: true, name: true, url: true, sortOrder: true, createdAt: true, updatedAt: true } as const;

export async function PATCH({ locals, params, request }: import('./$types').RequestEvent) {
	const actor = requireSystemAdminApi(locals.user);
	const id = parseId(params.id);
	const parsed = parseExternalLinkInput(await request.json().catch(() => null));
	if (!id) return failure(404, 'NOT_FOUND', 'External link not found.');
	if (!parsed.success) return failure(400, 'VALIDATION_ERROR', 'One or more fields are invalid.', parsed.errors);
	try {
		const item = await getPrisma().$transaction(async (tx) => {
			const changed = await tx.externalLink.updateMany({ where: { id, deletedAt: null }, data: parsed.data });
			if (!changed.count) return null;
			await writeAuditLog(tx, actor.id, 'update', 'external_link', id);
			return tx.externalLink.findUnique({ where: { id }, select });
		});
		return item ? success(item) : failure(404, 'NOT_FOUND', 'External link not found.');
	} catch (error) {
		return duplicateField(error)
			? failure(409, 'DUPLICATE_VALUE', 'An external link with this name already exists.', [{ field: 'name', reason: 'DUPLICATE_VALUE' }])
			: failure(400, 'INVALID_REQUEST', 'Unable to update the external link.');
	}
}

export async function DELETE({ locals, params }: import('./$types').RequestEvent) {
	const actor = requireSystemAdminApi(locals.user);
	const id = parseId(params.id);
	if (!id) return failure(404, 'NOT_FOUND', 'External link not found.');
	const deleted = await getPrisma().$transaction(async (tx) => {
		const changed = await tx.externalLink.updateMany({ where: { id, deletedAt: null }, data: { deletedAt: new Date() } });
		if (!changed.count) return false;
		await writeAuditLog(tx, actor.id, 'delete', 'external_link', id);
		return true;
	});
	return deleted ? success({ id, deleted: true }) : failure(404, 'NOT_FOUND', 'External link not found.');
}
