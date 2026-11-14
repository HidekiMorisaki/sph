import {requireSystemAdminApi} from '#lib/server/api/admin.js';
import { requireOperationApi } from '#lib/server/api/admin.js';
import { permissionOperations } from '#lib/server/auth/permissions.js';
import { failure, success } from '#lib/server/api/response.js';
import { isItAssetOrderResource, parseItAssetOrder, reorderItAssetMasters, ItAssetOrderConflictError } from '#lib/server/api/it-asset-order.js';

export async function PUT({ params, request, locals }: import('./$types').RequestEvent) {
	requireSystemAdminApi(locals.user);
	const actor = requireOperationApi(locals.user, permissionOperations.masterManagement);
	if (!isItAssetOrderResource(params.resource)) return failure(404, 'NOT_FOUND', 'Not found.');
	const input = parseItAssetOrder(await request.json().catch(() => null));
	if (!input) return failure(400, 'INVALID_REQUEST', 'Invalid order.');
	try {
		return success({ ids: await reorderItAssetMasters(params.resource, input.expectedIds, input.orderedIds, actor.id) });
	} catch (error) {
		if (error instanceof ItAssetOrderConflictError || (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2034'))
			return failure(409, 'ORDER_CHANGED', 'The order has changed. Reload and try again.');
		throw error;
	}
}
