import { requireAdminApi, requireSystemAdminApi } from '$lib/server/api/admin';
import { duplicateField, parseId } from '$lib/server/api/database';
import { BranchEmployeeReferenceError, isEmployeeMasterResource, masterInput, softDeleteMaster, updateMaster, type EmployeeMasterInput } from '$lib/server/api/employee-masters';
import { cpuTypeConflictField, deleteItAssetMaster, isItAssetMasterResource, parseItAssetMasterInput, updateItAssetMaster } from '$lib/server/api/it-asset-masters';
import { failure, success, throwApiError } from '$lib/server/api/response';

function resource(value: string) {
	if (!isEmployeeMasterResource(value) && !isItAssetMasterResource(value)) throwApiError(404, 'NOT_FOUND', 'The requested API resource was not found.');
	return value;
}

export async function PATCH({ params, request, locals }: import('./$types').RequestEvent) {
	const actor = params.master === 'branches' ? requireSystemAdminApi(locals.user) : requireAdminApi(locals.user);
	const selected = resource(params.master);
	const id = parseId(params.id);
	const value = await request.json().catch(() => null);
	const data = isItAssetMasterResource(selected) ? parseItAssetMasterInput(selected, value) : masterInput(selected, value);
	if (!id || !data) return failure(400, 'INVALID_REQUEST', 'Invalid request.');
	try {
		const item = isItAssetMasterResource(selected) ? await updateItAssetMaster(selected, id, data, actor.id) : await updateMaster(selected, id, data as EmployeeMasterInput, actor.id);
		return item ? success(item) : failure(404, 'NOT_FOUND', 'Not found.');
	} catch (error) {
		if (error instanceof BranchEmployeeReferenceError) return failure(400, 'VALIDATION_ERROR', 'One or more fields are invalid.', [{ field: error.field, reason: 'Select an existing employee.' }]);
		const field = selected === 'cpu-types' ? cpuTypeConflictField(error) : duplicateField(error);
		if (field) return failure(409, 'DUPLICATE_VALUE', 'This value already exists.', [{ field, reason: 'DUPLICATE_VALUE' }]);
		return failure(400, 'INVALID_REQUEST', 'Invalid request.');
	}
}

export async function DELETE({ params, locals }: import('./$types').RequestEvent) {
	const actor = params.master === 'branches' ? requireSystemAdminApi(locals.user) : requireAdminApi(locals.user);
	const selected = resource(params.master);
	const id = parseId(params.id);
	if (!id) return failure(404, 'NOT_FOUND', 'Not found.');
	const result = isItAssetMasterResource(selected) ? await deleteItAssetMaster(selected, id, actor.id) : await softDeleteMaster(selected, id, actor.id);
	if (result === 'referenced') return failure(409, 'RESOURCE_IN_USE', 'The item is still referenced.');
	if (result === 'not_found') return failure(404, 'NOT_FOUND', 'Not found.');
	return success({ id, deleted: true });
}
