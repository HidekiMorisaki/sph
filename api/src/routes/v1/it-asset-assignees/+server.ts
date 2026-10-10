import { requireScopedOperationApi } from '$lib/server/api/branch-access';
import { permissionOperations } from '$lib/server/auth/permissions';
import { success } from '$lib/server/api/response';
import { getPrisma } from '$lib/server/prisma';

export async function GET({ locals }: import('./$types').RequestEvent) {
	const { branchId } = requireScopedOperationApi(locals.user, permissionOperations.assetManagement);
	return success(await getPrisma().employee.findMany({ where: { deletedAt: null, ...(branchId === null ? {} : { branchId }), OR: [{ retiredAt: null }, { retiredAt: { gt: new Date() } }] }, select: { id: true, employeeCode: true, firstName: true, middleName: true, lastName: true }, orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }] }));
}
