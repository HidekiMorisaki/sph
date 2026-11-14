import { requireScopedOperationApi } from '#lib/server/api/branch-access.js';
import { parseId } from '#lib/server/api/database.js';
import { parseListQuery, listMeta, parseSearch } from '#lib/server/api/query.js';
import { teamReader } from '#lib/server/api/teams.js';
import { employeeSafeSelect, employeeOutput } from '#lib/server/api/employee-output.js';
import { success, failure } from '#lib/server/api/response.js';
import { getPrisma } from '#lib/server/prisma.js';

export async function GET({ locals, params, url }: import('./$types').RequestEvent) {
 teamReader(locals.user);
 const { branchId } = requireScopedOperationApi(locals.user, 'employees.read');
 const id = parseId(params.id);
 if (!id || !await getPrisma().team.count({ where: { id, deletedAt: null } })) return failure(404, 'NOT_FOUND', 'Not found.');
 const query = parseListQuery(url, ['employeeCode','firstName','lastName','branch'] as const, 'employeeCode');
 const search = parseSearch(url);
 const contains = { contains: search, mode: 'insensitive' as const };
 const where = { deletedAt: null, ...(branchId === null ? {} : { branchId }), teamAssignments: { some: { teamId: id, deletedAt: null, team: { deletedAt: null } } }, ...(search ? { OR: [{ employeeCode: contains }, { firstName: contains }, { lastName: contains }] } : {}) };
 const [total, items] = await getPrisma().$transaction([
  getPrisma().employee.count({ where }),
  getPrisma().employee.findMany({ where, select: employeeSafeSelect, orderBy: [query.sortBy === 'branch' ? { branch: { name: query.sortOrder } } : { [query.sortBy]: query.sortOrder }, { id: 'asc' }], skip: query.offset, take: query.limit })
 ]);
 return success(items.map(item => employeeOutput(item)), 200, listMeta(query, items.length, total));
}
