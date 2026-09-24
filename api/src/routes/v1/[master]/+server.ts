import { requireAdminApi, requireAuthenticatedApi } from '$lib/server/api/admin';
import { createMaster, isEmployeeMasterResource, listMasters, masterInput, masterSortFields } from '$lib/server/api/employee-masters';
import { cpuTypeConflictField, cpuTypeSortFields, createItAssetMaster, isItAssetMasterResource, listItAssetMasters, parseItAssetMasterInput } from '$lib/server/api/it-asset-masters';
import { listMeta, parseListQuery, parseSearch } from '$lib/server/api/query';
import { duplicateField } from '$lib/server/api/database';
import { failure, success, throwApiError } from '$lib/server/api/response';

function resource(value: string) {
	if (!isEmployeeMasterResource(value) && !isItAssetMasterResource(value)) throwApiError(404, 'NOT_FOUND', 'The requested API resource was not found.');
	return value;
}

export async function GET({ params, locals, url }: import('./$types').RequestEvent) {
	requireAuthenticatedApi(locals.user);
	const selected = resource(params.master);
	const search = parseSearch(url);
	if (isItAssetMasterResource(selected)) {
		const fields = selected === 'cpu-types' ? cpuTypeSortFields
			: selected === 'it-asset-types' ? ['id', 'code', 'name', 'managementCodePrefix', 'sortOrder', 'createdAt', 'updatedAt'] as const
			: selected === 'manufacturers' ? ['id', 'code', 'name', 'officialUrl', 'sortOrder', 'createdAt', 'updatedAt'] as const
			: selected === 'operating-systems' ? ['id', 'code', 'displayName', 'vendor', 'product', 'version', 'sortOrder', 'createdAt', 'updatedAt'] as const
			: ['id', 'code', 'name', 'disposalDatePolicy', 'sortOrder', 'createdAt', 'updatedAt'] as const;
		const query = parseListQuery(url, fields, 'sortOrder');
		const { items, total } = await listItAssetMasters(selected, query, search);
		return success(items, 200, listMeta(query, items.length, total));
	}
	const query = parseListQuery(url, masterSortFields, 'code');
	const { items, total } = await listMasters(selected, query, search);
	return success(items, 200, listMeta(query, items.length, total));
}

export async function POST({ params, request, locals }: import('./$types').RequestEvent) {
	const actor = requireAdminApi(locals.user);
	const selected = resource(params.master); const value = await request.json().catch(() => null);
	const data = isItAssetMasterResource(selected) ? parseItAssetMasterInput(selected, value) : masterInput(value);
	if (!data) return failure(400, 'INVALID_REQUEST', 'Invalid request.');
	try {
		return success(isItAssetMasterResource(selected) ? await createItAssetMaster(selected, data, actor.id) : await createMaster(selected, data as { code: string; name: string }, actor.id), 201);
	} catch (error) {
		const field = selected === 'cpu-types' ? cpuTypeConflictField(error) : duplicateField(error);
		if (field) return failure(409, 'DUPLICATE_VALUE', 'This value already exists.', [{ field, reason: 'DUPLICATE_VALUE' }]);
		return failure(400, 'INVALID_REQUEST', 'Invalid request.');
	}
}
