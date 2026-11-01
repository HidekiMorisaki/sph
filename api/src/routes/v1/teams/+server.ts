import { requireOperationApi, writeAuditLog } from '$lib/server/api/admin';
import { businessList } from '$lib/server/api/business-list';
import { parseTeam, teamReader, teamSelect, teamConflictResponse } from '$lib/server/api/teams';
import { success } from '$lib/server/api/response';
import { getPrisma } from '$lib/server/prisma';

export async function GET({ locals, url }: import('./$types').RequestEvent) {
 return businessList(locals.user, 'teams', url);
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
