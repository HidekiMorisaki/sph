import { requireBranchManagementApi, requireMasterManagementApi } from '$lib/server/api/admin';
import { isLocationOrderResource, parseLocationOrder, reorderLocations, LocationOrderConflictError } from '$lib/server/api/location-order';
import { failure, success } from '$lib/server/api/response';

export async function PUT({ params, request, locals }: import('./$types').RequestEvent) {
	const actor = params.resource === 'branches' ? requireBranchManagementApi(locals.user) : requireMasterManagementApi(locals.user);
	if (!isLocationOrderResource(params.resource)) return failure(404, 'NOT_FOUND', 'Not found.');
	const input = parseLocationOrder(await request.json().catch(() => null));
	if (!input) return failure(400, 'INVALID_REQUEST', 'Invalid order.');
	try {
		const ids = await reorderLocations(params.resource, input.expectedIds, input.orderedIds, actor.id);
		return success({ ids });
	} catch (error) {
		if (error instanceof LocationOrderConflictError || (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2034')) {
			return failure(409, 'ORDER_CHANGED', 'The order has changed. Reload and try again.');
		}
		throw error;
	}
}
