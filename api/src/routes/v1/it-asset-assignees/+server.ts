import { requireAssetWriteApi } from '$lib/server/api/admin';
import { success } from '$lib/server/api/response';
import { getPrisma } from '$lib/server/prisma';

export async function GET({ locals }: import('./$types').RequestEvent) {
	requireAssetWriteApi(locals.user);
	return success(await getPrisma().employee.findMany({ where: { deletedAt: null, OR: [{ retiredAt: null }, { retiredAt: { gt: new Date() } }] }, select: { id: true, employeeCode: true, firstName: true, middleName: true, lastName: true }, orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }] }));
}
