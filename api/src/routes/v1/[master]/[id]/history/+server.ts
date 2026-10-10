import { requireOperationApi } from '$lib/server/api/admin';
import { referenceBranchScope } from '$lib/server/api/branch-access';
import { hasOwnBranchPermissionOperation, hasPermissionOperation, permissionOperations } from '$lib/server/auth/permissions';
import { parseId } from '$lib/server/api/database';
import { masterHistoryFields, type MasterHistoryResource } from '$lib/server/api/master-history';
import { listMeta, parseListQuery } from '$lib/server/api/query';
import { failure, success } from '$lib/server/api/response';
import { getPrisma } from '$lib/server/prisma';

const sortFields = ['changedAt', 'id'] as const;
const aliases: Record<string, MasterHistoryResource> = { rooms: 'room', roles: 'role', 'external-links': 'external_link' };

export async function GET({ params, locals, url }: import('./$types').RequestEvent) {
	const resource = aliases[params.master] ?? params.master;
	if (!(resource in masterHistoryFields)) return failure(404, 'NOT_FOUND', 'Not found.');
	if (resource === 'role' && locals.user && hasOwnBranchPermissionOperation(locals.user, permissionOperations.roleRead) && !hasPermissionOperation(locals.user, permissionOperations.systemManagement)) return failure(403, 'PERMISSION_REQUIRED', 'Permission is required.');
	if (resource !== 'role' || !locals.user || !hasPermissionOperation(locals.user, permissionOperations.systemManagement)) {
		requireOperationApi(locals.user, resource === 'role' ? permissionOperations.roleRead : permissionOperations.masterRead);
	}
	const id = parseId(params.id);
	if (!id) return failure(404, 'NOT_FOUND', 'Not found.');
	const branchId = ['branches', 'room', 'storage'].includes(resource) ? referenceBranchScope(locals.user) : null;
	const query = parseListQuery(url, sortFields, 'changedAt');
	const db = getPrisma();
	const active = await db.$transaction(async (tx) => {
		switch (resource) {
			case 'departments': return tx.department.count({ where: { id, deletedAt: null } });
			case 'employee-groups': return tx.employeeGroup.count({ where: { id, deletedAt: null } });
			case 'positions': return tx.position.count({ where: { id, deletedAt: null } });
			case 'employment-types': return tx.employmentType.count({ where: { id, deletedAt: null } });
			case 'branches': return tx.branch.count({ where: { id, deletedAt: null, ...(branchId === null ? {} : { id: branchId }) } });
			case 'room': return tx.room.count({ where: { id, deletedAt: null, ...(branchId === null ? {} : { branchId }) } });
			case 'storage': return tx.storage.count({ where: { id, deletedAt: null, ...(branchId === null ? {} : { branchId }) } });
			case 'it-asset-types': return tx.itAssetType.count({ where: { id, deletedAt: null } });
			case 'manufacturers': return tx.manufacturer.count({ where: { id, deletedAt: null } });
			case 'cpu-types': return tx.cpuType.count({ where: { id, deletedAt: null } });
			case 'operating-system-vendors': return tx.operatingSystemVendor.count({ where: { id, deletedAt: null } });
			case 'operating-systems': return tx.operatingSystem.count({ where: { id, deletedAt: null } });
			case 'it-asset-statuses': return tx.itAssetStatus.count({ where: { id, deletedAt: null } });
			case 'role': return tx.role.count({ where: { id, deletedAt: null } });
			case 'external_link': return tx.externalLink.count({ where: { id, deletedAt: null } });
			default: return 0;
		}
	});
	if (!active) return failure(404, 'NOT_FOUND', 'Not found.');
	const where = { resource, resourceId: id, deletedAt: null };
	const [total, items] = await db.$transaction([
		db.masterChangeHistory.count({ where }),
		db.masterChangeHistory.findMany({ where, select: { id: true, action: true, changes: true, changedAt: true, actor: { select: { firstName: true, middleName: true, lastName: true } } }, orderBy: [{ [query.sortBy]: query.sortOrder }, { id: 'desc' }], skip: query.offset, take: query.limit })
	]);
	const response = success(items, 200, listMeta(query, items.length, total));
	response.headers.set('Cache-Control', 'no-store');
	return response;
}
