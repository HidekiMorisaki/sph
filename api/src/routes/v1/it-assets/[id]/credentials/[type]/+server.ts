import { assetBranchWhere, requireScopedOperationApi } from '$lib/server/api/branch-access';
import { permissionOperations } from '$lib/server/auth/permissions';
import { applyCredentialChanges, isAssetCredentialType } from '$lib/server/api/it-asset-credentials';
import { parseId } from '$lib/server/api/database';
import { failure, success } from '$lib/server/api/response';
import { getPrisma } from '$lib/server/prisma';

function credentialType(value: string) {
	return isAssetCredentialType(value) ? value : null;
}

export async function PUT({ params, locals, request }: import('./$types').RequestEvent) {
	const { actor, branchId } = requireScopedOperationApi(locals.user, permissionOperations.assetCredentialWrite);
	const assetId = parseId(params.id);
	const type = credentialType(params.type);
	if (!assetId || !type) return failure(404, 'NOT_FOUND', 'Not found.');
	const body = await request.json().catch(() => null) as Record<string, unknown> | null;
	const password = body?.password;
	if (typeof password !== 'string' || password.length === 0 || password.length > 1024) return failure(400, 'VALIDATION_ERROR', 'Invalid asset credential input.', [{ field: 'password', reason: 'Enter a password between 1 and 1024 characters.' }]);
	const saved = await getPrisma().$transaction(async tx => {
		if (!await tx.itAsset.count({ where: { id: assetId, deletedAt: null, ...assetBranchWhere(branchId) } })) return false;
		await applyCredentialChanges(tx, assetId, actor.id, { [type]: { action: 'set', password } });
		return true;
	});
	return saved ? success({ credentialType: type, configured: true }) : failure(404, 'NOT_FOUND', 'Not found.');
}

export async function DELETE({ params, locals }: import('./$types').RequestEvent) {
	const { actor, branchId } = requireScopedOperationApi(locals.user, permissionOperations.assetCredentialWrite);
	const assetId = parseId(params.id);
	const type = credentialType(params.type);
	if (!assetId || !type) return failure(404, 'NOT_FOUND', 'Not found.');
	const saved = await getPrisma().$transaction(async tx => {
		if (!await tx.itAsset.count({ where: { id: assetId, deletedAt: null, ...assetBranchWhere(branchId) } })) return false;
		await applyCredentialChanges(tx, assetId, actor.id, { [type]: { action: 'clear' } });
		return true;
	});
	return saved ? success({ credentialType: type, configured: false }) : failure(404, 'NOT_FOUND', 'Not found.');
}
