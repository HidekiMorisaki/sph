import { requireOperationApi, writeAuditLog } from '$lib/server/api/admin';
import { parseListQuery, listMeta, parseSearch } from '$lib/server/api/query';
import { parseTeam, teamReader, teamSelect, readableMembersWhere, teamConflictResponse } from '$lib/server/api/teams';
import { success } from '$lib/server/api/response';
import { getPrisma } from '$lib/server/prisma';
import { Prisma } from '$lib/server/generated/prisma/client';

export async function GET({ locals, url }: import('./$types').RequestEvent) {
 const actor = teamReader(locals.user);
 const query = parseListQuery(url, ['name','description','memberCount','createdAt','updatedAt'] as const, 'name');
 const search = parseSearch(url);
 const contains = { contains: search, mode: 'insensitive' as const };
 const where = { deletedAt: null, ...(search ? { OR: [{ name: contains }, { description: contains }] } : {}) };
 const { total, items } = await getPrisma().$transaction(async tx => {
  const total = await tx.team.count({ where });
  let sortedIds: number[] | undefined;
  if (query.sortBy === 'memberCount') {
   const scope = actor.permissionOperations.includes('employees.read') ? Prisma.empty
    : actor.ownBranchPermissionOperations.includes('employees.read') ? Prisma.sql`AND e.branch_id=${actor.branchId}` : Prisma.sql`AND false`;
   const pattern = `%${search}%`;
   const rows = await tx.$queryRaw<Array<{ id: number }>>(Prisma.sql`
    SELECT t.id FROM teams t WHERE t.deleted_at IS NULL
    ${search ? Prisma.sql`AND (t.name ILIKE ${pattern} OR t.description ILIKE ${pattern})` : Prisma.empty}
    ORDER BY (SELECT count(*) FROM employee_teams m JOIN employees e ON e.id=m.employee_id AND e.deleted_at IS NULL
     WHERE m.team_id=t.id AND m.deleted_at IS NULL ${scope}) ${query.sortOrder === 'asc' ? Prisma.sql`ASC` : Prisma.sql`DESC`}, t.id ASC
    OFFSET ${query.offset} LIMIT ${query.limit}`);
   sortedIds = rows.map(row => row.id);
  }
  const records = await tx.team.findMany({ where: { ...where, ...(sortedIds ? { id: { in: sortedIds } } : {}) }, select: { ...teamSelect, _count: { select: { members: { where: { deletedAt: null, employee: readableMembersWhere(actor) } } } } }, ...(sortedIds ? {} : { orderBy: [{ [query.sortBy]: query.sortOrder }, { id: 'asc' }], skip: query.offset, take: query.limit }) });
  const byId = new Map(records.map(item => [item.id,item]));
  return { total, items: sortedIds ? sortedIds.map(id => byId.get(id)!) : records };
 }, { isolationLevel: 'RepeatableRead' });
 return success(items.map(({ _count, ...item }) => ({ ...item, memberCount: _count.members })), 200, listMeta(query, items.length, total));
}

export async function POST({ locals, request }: import('./$types').RequestEvent) {
 const actor = requireOperationApi(locals.user, 'teams.create');
 teamReader(actor);
 const input = parseTeam(await request.json().catch(() => null));
 try {
  const item = await getPrisma().$transaction(async tx => {
   const item = await tx.team.create({ data: input, select: teamSelect });
   await writeAuditLog(tx, actor.id, 'create', 'team', item.id, input);
   return item;
  });
  return success(item, 201);
 } catch (error) {
  const conflict = await teamConflictResponse(error, input.name);
  if (conflict) return conflict;
  throw error;
 }
}
