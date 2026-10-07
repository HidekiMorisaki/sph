import { requireBranchManagementApi, requireOperationApi } from '$lib/server/api/admin';
import { permissionOperations } from '$lib/server/auth/permissions';
import { BranchEmployeeReferenceError, BranchInUseError, EmployeeGroupDepartmentConflictError, EmployeeGroupDepartmentReferenceError, branchSortFields, createMaster, employeeGroupSortFields, isEmployeeMasterResource, listMasters, masterInput, namedMasterSortFields, type EmployeeMasterInput } from '$lib/server/api/employee-masters';
import { cpuTypeConflictField, cpuTypeSortFields, createItAssetMaster, InactiveOperatingSystemVendorError, isItAssetMasterResource, listItAssetMasters, operatingSystemConflictField, operatingSystemNameError, parseItAssetMasterInput } from '$lib/server/api/it-asset-masters';
import { listMeta, parseListQuery, parseSearch } from '$lib/server/api/query';
import { duplicateField } from '$lib/server/api/database';
import { failure, success, throwApiError } from '$lib/server/api/response';

function resource(value: string) {
	if (!isEmployeeMasterResource(value) && !isItAssetMasterResource(value)) throwApiError(404, 'NOT_FOUND', 'The requested API resource was not found.');
	return value;
}

export async function GET({ params, locals, url }: import('./$types').RequestEvent) {
	requireOperationApi(locals.user, permissionOperations.masterRead);
	const selected = resource(params.master);
	const search = parseSearch(url);
	if (isItAssetMasterResource(selected)) {
		const fields = selected === 'cpu-types' ? cpuTypeSortFields
			: selected === 'it-asset-types' ? ['id', 'name', 'managementCodePrefix', 'sortOrder', 'createdAt', 'updatedAt'] as const
			: selected === 'manufacturers' ? ['id', 'name', 'officialUrl', 'sortOrder', 'createdAt', 'updatedAt'] as const
			: selected === 'operating-system-vendors' ? ['id', 'name', 'sortOrder', 'createdAt', 'updatedAt'] as const
			: selected === 'operating-systems' ? ['id', 'vendor', 'product', 'version', 'sortOrder', 'createdAt', 'updatedAt'] as const
			: ['id', 'name', 'disposalDatePolicy', 'sortOrder', 'createdAt', 'updatedAt'] as const;
		const query = parseListQuery(url, fields, 'sortOrder');
		const { items, total } = await listItAssetMasters(selected, query, search);
		return success(items, 200, listMeta(query, items.length, total));
	}
	const fields = selected === 'branches' ? branchSortFields : selected === 'employee-groups' ? employeeGroupSortFields : namedMasterSortFields;
	const query = parseListQuery(url, fields, 'sortOrder');
	const { items, total } = await listMasters(selected, query, search);
	return success(items, 200, listMeta(query, items.length, total));
}

export async function POST({ params, request, locals }: import('./$types').RequestEvent) {
	const actor = params.master === 'branches' ? requireBranchManagementApi(locals.user) : requireOperationApi(locals.user, permissionOperations.masterManagement);
	const selected = resource(params.master);
	const value = await request.json().catch(() => null);
	const data = isItAssetMasterResource(selected) ? parseItAssetMasterInput(selected, value) : masterInput(selected, value);
	if (!data) return failure(400, 'INVALID_REQUEST', 'Invalid request.');
	if (isItAssetMasterResource(selected) && value && typeof value === 'object' && !Object.hasOwn(value, 'sortOrder')) data.sortOrder = 2_147_483_647;
	try {
		return success(isItAssetMasterResource(selected) ? await createItAssetMaster(selected, data, actor.id) : await createMaster(selected, data as EmployeeMasterInput, actor.id), 201);
	} catch (error) {
		if (error instanceof InactiveOperatingSystemVendorError) return failure(400, 'VALIDATION_ERROR', 'One or more fields are invalid.', [{ field: 'vendorId', reason: 'Select an active OS vendor.' }]);
		const osError = operatingSystemNameError(error);
		if (osError === 'too_long') return failure(400, 'VALIDATION_ERROR', 'One or more fields are invalid.', [{ field: selected === 'operating-system-vendors' ? 'name' : 'version', reason: 'The OS name is too long.' }]);
		if (osError === 'duplicate') return failure(409, 'DUPLICATE_VALUE', 'This value already exists.', [{ field: selected === 'operating-system-vendors' ? 'name' : 'version', reason: 'DUPLICATE_VALUE' }]);
		if (error instanceof BranchEmployeeReferenceError) return failure(400, 'VALIDATION_ERROR', 'One or more fields are invalid.', [{ field: error.field, reason: 'Select an existing employee.' }]);
		if (error instanceof BranchInUseError) return failure(409, 'RESOURCE_IN_USE', 'The branch is still referenced.');
		if (error instanceof EmployeeGroupDepartmentReferenceError) return failure(400, 'VALIDATION_ERROR', 'One or more fields are invalid.', [{ field: 'departmentId', reason: 'Select an active department.' }]);
		if (error instanceof EmployeeGroupDepartmentConflictError) return failure(409, 'RESOURCE_IN_USE', 'The group is referenced by employees in another department.');
		const field = selected === 'cpu-types' ? cpuTypeConflictField(error) : selected === 'operating-systems' ? operatingSystemConflictField(error) : duplicateField(error);
		if (field) return failure(409, 'DUPLICATE_VALUE', 'This value already exists.', [{ field, reason: 'DUPLICATE_VALUE' }]);
		return failure(400, 'INVALID_REQUEST', 'Invalid request.');
	}
}
