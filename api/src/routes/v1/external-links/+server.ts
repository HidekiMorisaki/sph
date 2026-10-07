import { requireAuthenticatedApi, requireSystemAdminApi, writeAuditLog } from '$lib/server/api/admin';
import { readMasterSnapshot, recordMasterChange } from '$lib/server/api/master-history';
import { duplicateField } from '$lib/server/api/database';
import { parseExternalLinkInput } from '$lib/server/api/external-link-input';
import { listMeta, parseListQuery, parseSearch } from '$lib/server/api/query';
import { failure, success } from '$lib/server/api/response';
import type { Prisma } from '$lib/server/generated/prisma/client';
import { getPrisma } from '$lib/server/prisma';

const sortFields = ['name', 'url', 'sortOrder', 'createdAt', 'updatedAt'] as const;
const select = { id: true, name: true, url: true, sortOrder: true, notes: true, createdAt: true, updatedAt: true } as const;

export async function GET({ locals, url }: import('./$types').RequestEvent) {
	requireAuthenticatedApi(locals.user);
	const query = parseListQuery(url, sortFields, 'sortOrder');
	const search = parseSearch(url);
	const where: Prisma.ExternalLinkWhereInput = {
		deletedAt: null,
		...(search ? { OR: [{ name: { contains: search, mode: 'insensitive' } }, { url: { contains: search, mode: 'insensitive' } }] } : {})
	};
	const orderBy: Prisma.ExternalLinkOrderByWithRelationInput[] = [
		{ [query.sortBy]: query.sortOrder },
		...(query.sortBy === 'sortOrder' ? [{ name: 'asc' as const }] : []),
		{ id: 'asc' }
	];
	const [total, items] = await getPrisma().$transaction([
		getPrisma().externalLink.count({ where }),
		getPrisma().externalLink.findMany({ where, select, orderBy, skip: query.offset, take: query.limit })
	]);
	const response = success(items, 200, listMeta(query, items.length, total));
	response.headers.set('Cache-Control', 'no-store');
	return response;
}

export async function POST({ locals, request }: import('./$types').RequestEvent) {
	const actor = requireSystemAdminApi(locals.user);
	const parsed = parseExternalLinkInput(await request.json().catch(() => null));
	if (!parsed.success) return failure(400, 'VALIDATION_ERROR', 'One or more fields are invalid.', parsed.errors);
	try {
		const result = await getPrisma().$transaction(async (tx) => {
			const existing = await tx.externalLink.findUnique({ where: { name: parsed.data.name }, select: { id: true, deletedAt: true } });
			if (existing && !existing.deletedAt) return 'duplicate' as const;
			const before = existing ? await readMasterSnapshot(tx, 'external_link', existing.id) : null;
			const item = existing
				? await tx.externalLink.update({ where: { id: existing.id }, data: { ...parsed.data, deletedAt: null }, select })
				: await tx.externalLink.create({ data: parsed.data, select });
			await writeAuditLog(tx, actor.id, existing ? 'restore' : 'create', 'external_link', item.id);
			await recordMasterChange(tx, 'external_link', item.id, actor.id, existing ? 'restore' : 'create', before, await readMasterSnapshot(tx, 'external_link', item.id));
			return item;
		}, { isolationLevel: 'Serializable' });
		return result === 'duplicate'
			? failure(409, 'DUPLICATE_VALUE', 'An external link with this name already exists.', [{ field: 'name', reason: 'DUPLICATE_VALUE' }])
			: success(result, 201);
	} catch (error) {
		return duplicateField(error)
			? failure(409, 'DUPLICATE_VALUE', 'An external link with this name already exists.', [{ field: 'name', reason: 'DUPLICATE_VALUE' }])
			: failure(400, 'INVALID_REQUEST', 'Unable to create the external link.');
	}
}
