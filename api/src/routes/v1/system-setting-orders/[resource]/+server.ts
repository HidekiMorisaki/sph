import { requireSystemAdminApi } from '$lib/server/api/admin';
import { failure, success } from '$lib/server/api/response';
import { isSystemSettingOrderResource, parseSystemSettingOrder, reorderSystemSettings, SystemSettingOrderConflictError } from '$lib/server/api/system-setting-order';

export async function PUT({ params, request, locals }: import('./$types').RequestEvent) {
	const actor = requireSystemAdminApi(locals.user);
	if (!isSystemSettingOrderResource(params.resource)) return failure(404, 'NOT_FOUND', 'Not found.');
	const input = parseSystemSettingOrder(await request.json().catch(() => null));
	if (!input) return failure(400, 'INVALID_REQUEST', 'Invalid order.');
	try {
		return success({ ids: await reorderSystemSettings(params.resource, input.expectedIds, input.orderedIds, actor.id) });
	} catch (error) {
		if (error instanceof SystemSettingOrderConflictError || (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2034'))
			return failure(409, 'ORDER_CHANGED', 'The order has changed. Reload and try again.');
		throw error;
	}
}
