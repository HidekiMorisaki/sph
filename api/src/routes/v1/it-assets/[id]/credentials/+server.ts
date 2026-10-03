import { requireAssetCredentialReadApi } from '$lib/server/api/admin';
import { ASSET_CREDENTIAL_TYPES } from '$lib/server/api/it-asset-credentials';
import { parseId } from '$lib/server/api/database';
import { failure, success } from '$lib/server/api/response';
import { getPrisma } from '$lib/server/prisma';

export async function GET({ params, locals }: import('./$types').RequestEvent) {
	requireAssetCredentialReadApi(locals.user);
	const assetId = parseId(params.id);
	if (!assetId) return failure(404, 'NOT_FOUND', 'Not found.');
	const prisma = getPrisma();
	if (!await prisma.itAsset.count({ where: { id: assetId, deletedAt: null } })) return failure(404, 'NOT_FOUND', 'Not found.');
	const records = await prisma.itAssetCredential.findMany({ where: { assetId, deletedAt: null }, select: { credentialType: true } });
	const configured = new Set(records.map((record) => record.credentialType));
	return success(Object.fromEntries(ASSET_CREDENTIAL_TYPES.map((type) => [type, { configured: configured.has(type) }])));
}
