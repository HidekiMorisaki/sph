import { requireOperationApi } from '$lib/server/api/admin';
import { permissionOperations } from '$lib/server/auth/permissions';
import { failure, success } from '$lib/server/api/response';
import { isWorkforceOrderResource, parseWorkforceOrder, reorderWorkforce, WorkforceOrderConflictError } from '$lib/server/api/workforce-order';

export async function PUT({ params, request, locals }: import('./$types').RequestEvent) {
	const actor = requireOperationApi(locals.user, permissionOperations.masterManagement);
	if (!isWorkforceOrderResource(params.resource)) return failure(404, 'NOT_FOUND', 'Not found.');
	const input = parseWorkforceOrder(await request.json().catch(() => null));
	if (!input) return failure(400, 'INVALID_REQUEST', 'Invalid order.');
	try {
		const ids = await reorderWorkforce(params.resource, input.expectedIds, input.orderedIds, actor.id);
		return success({ ids });
	} catch (error) {
		if (error instanceof WorkforceOrderConflictError || (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2034')) {
			return failure(409, 'ORDER_CHANGED', 'The order has changed. Reload and try again.');
		}
		throw error;
	}
}
