import { requireAdminApi, requireAuthenticatedApi, requireSystemAdminApi } from '$lib/server/api/admin';
import { BranchEmployeeReferenceError, branchSortFields, createMaster, isEmployeeMasterResource, listMasters, masterInput, masterSortFields, namedMasterSortFields, type EmployeeMasterInput } from '$lib/server/api/employee-masters';
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
			: selected === 'it-asset-types' ? ['id', 'name', 'managementCodePrefix', 'sortOrder', 'createdAt', 'updatedAt'] as const
			: selected === 'manufacturers' ? ['id', 'name', 'officialUrl', 'sortOrder', 'createdAt', 'updatedAt'] as const
			: selected === 'operating-systems' ? ['id', 'displayName', 'vendor', 'product', 'version', 'sortOrder', 'createdAt', 'updatedAt'] as const
			: ['id', 'name', 'disposalDatePolicy', 'sortOrder', 'createdAt', 'updatedAt'] as const;
		const defaultSort = selected === 'manufacturers' ? 'name' : selected === 'cpu-types' || selected === 'operating-systems' ? 'displayName' : 'sortOrder';
		const query = parseListQuery(url, fields, defaultSort);
		const { items, total } = await listItAssetMasters(selected, query, search);
		return success(items, 200, listMeta(query, items.length, total));
	}
	const usesCode = selected === 'employee-groups';
	const fields = selected === 'branches' ? branchSortFields : usesCode ? masterSortFields : namedMasterSortFields;
	const query = parseListQuery(url, fields, usesCode ? 'code' : 'name');
	const { items, total } = await listMasters(selected, query, search);
	return success(items, 200, listMeta(query, items.length, total));
}

export async function POST({ params, request, locals }: import('./$types').RequestEvent) {
	const actor = params.master === 'branches' ? requireSystemAdminApi(locals.user) : requireAdminApi(locals.user);
	const selected = resource(params.master);
	const value = await request.json().catch(() => null);
	const data = isItAssetMasterResource(selected) ? parseItAssetMasterInput(selected, value) : masterInput(selected, value);
	if (!data) return failure(400, 'INVALID_REQUEST', 'Invalid request.');
	try {
		return success(isItAssetMasterResource(selected) ? await createItAssetMaster(selected, data, actor.id) : await createMaster(selected, data as EmployeeMasterInput, actor.id), 201);
	} catch (error) {
		if (error instanceof BranchEmployeeReferenceError) return failure(400, 'VALIDATION_ERROR', 'One or more fields are invalid.', [{ field: error.field, reason: 'Select an existing employee.' }]);
		const field = selected === 'cpu-types' ? cpuTypeConflictField(error) : duplicateField(error);
		if (field) return failure(409, 'DUPLICATE_VALUE', 'This value already exists.', [{ field, reason: 'DUPLICATE_VALUE' }]);
		return failure(400, 'INVALID_REQUEST', 'Invalid request.');
	}
}
