import { requireAdminApi, requireAuthenticatedApi } from '$lib/server/api/admin';
import { createMaster, isEmployeeMasterResource, listMasters, masterInput, masterSortFields } from '$lib/server/api/employee-masters';
import { createItAssetMaster, isItAssetMasterResource, itAssetMasterSortFields, listItAssetMasters, parseItAssetMasterInput } from '$lib/server/api/it-asset-masters';
import { listMeta, parseListQuery } from '$lib/server/api/query';
import { failure, success, throwApiError } from '$lib/server/api/response';

function resource(value: string) {
	if (!isEmployeeMasterResource(value) && !isItAssetMasterResource(value)) throwApiError(404, 'NOT_FOUND', 'The requested API resource was not found.');
	return value;
}

export async function GET({ params, locals, url }: import('./$types').RequestEvent) {
	requireAuthenticatedApi(locals.user);
	const selected = resource(params.master);
	if (isItAssetMasterResource(selected)) {
		const query = parseListQuery(url, itAssetMasterSortFields, 'sortOrder');
		const { items, total } = await listItAssetMasters(selected, query);
		return success(items, 200, listMeta(query, items.length, total));
	}
	const query = parseListQuery(url, masterSortFields, 'code');
	const { items, total } = await listMasters(selected, query);
	return success(items, 200, listMeta(query, items.length, total));
}

export async function POST({ params, request, locals }: import('./$types').RequestEvent) {
	const actor = requireAdminApi(locals.user);
	const selected = resource(params.master); const value = await request.json().catch(() => null);
	const data = isItAssetMasterResource(selected) ? parseItAssetMasterInput(selected, value) : masterInput(value);
	if (!data) return failure(400, 'INVALID_REQUEST', 'Invalid request.');
	try {
		return success(isItAssetMasterResource(selected) ? await createItAssetMaster(selected, data, actor.id) : await createMaster(selected, data as { code: string; name: string }, actor.id), 201);
	} catch {
		return failure(400, 'INVALID_REQUEST', 'Invalid request.');
	}
}
