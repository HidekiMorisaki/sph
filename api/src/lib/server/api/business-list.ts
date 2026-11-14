import { Prisma } from '#lib/server/generated/prisma/client.js';
import type { AuthenticatedUser } from '#lib/server/auth/types.js';
import { getPrisma } from '#lib/server/prisma.js';
import { requireOperationApi } from './admin';
import { businessSearchContexts, businessSorts, teamMemberCount, type BusinessTarget } from './business-search-registry';
import { listMeta, parseListQuery, parseSearch } from './query';
import { success } from './response';

const commonSelect = {id:true,name:true,description:true,createdAt:true,updatedAt:true} as const;
const keywordFields: Record<BusinessTarget,string[]> = {
 teams:['name','description'],skills:['name','description','category'],engagements:['name','description'],
 clients:['name','companyName','contactName','contactDepartment','contactEmail','contactMobile','city','notes']
};
export async function businessList(user: AuthenticatedUser | null, target: BusinessTarget, url: URL, conditions: Prisma.Sql = Prisma.sql`true`) {
 const actor = requireOperationApi(user ? {...user,activeOperation:undefined} : null,target+'.read');
 const query = parseListQuery(url,businessSorts[target],'name');
 const fields = businessSearchContexts(target)[0].fields;
 const expression = (key: string) => target === 'teams' && key === 'memberCount' ? teamMemberCount(actor) : Prisma.raw(fields.find(field => field.code === key)!.expression);
 const keyword = parseSearch(url);
 const pattern = '%' + keyword.toLowerCase().replace(/[\\%_]/g, char => '\\' + char) + '%';
 const matching = keyword ? Prisma.sql`(${Prisma.join(keywordFields[target].map(key => Prisma.sql`lower(${expression(key)}) LIKE ${pattern}`),' OR ')})` : Prisma.sql`true`;
 const where = Prisma.sql`business.deleted_at IS NULL AND ${matching} AND (${conditions})`;
 const result = await getPrisma().$transaction(async tx => {
  const [count] = await tx.$queryRaw<Array<{total:number}>>(Prisma.sql`SELECT count(*)::int AS total FROM ${Prisma.raw(target)} business WHERE ${where}`);
  const ids = await tx.$queryRaw<Array<{id:number;memberCount?:number}>>(Prisma.sql`SELECT business.id ${target === 'teams' ? Prisma.sql`, ${teamMemberCount(actor)} AS "memberCount"` : Prisma.empty} FROM ${Prisma.raw(target)} business WHERE ${where} ORDER BY ${expression(query.sortBy)} ${query.sortOrder === 'asc' ? Prisma.sql`ASC` : Prisma.sql`DESC`}, business.id ASC OFFSET ${query.offset} LIMIT ${query.limit}`);
  const filter = {id:{in:ids.map(row=>row.id)},deletedAt:null};
  const records = target === 'teams' ? await tx.team.findMany({where:filter,select:commonSelect})
   : target === 'skills' ? await tx.skill.findMany({where:filter,select:{...commonSelect,category:true}})
   : target === 'engagements' ? await tx.engagement.findMany({where:filter,select:{...commonSelect,clientId:true,contractStartsOn:true,contractEndsOn:true,client:{select:{id:true,name:true,companyName:true}}}})
   : await tx.client.findMany({where:filter});
  const byId = new Map<number, typeof records[number]>(records.map(row=>[row.id,row]));
  const items = ids.map(row=>({...byId.get(row.id)!,...(target === 'teams' ? {memberCount:row.memberCount} : {})}));
  return {total:count.total,items};
 },{isolationLevel:'RepeatableRead'});
 return success(result.items,200,listMeta(query,result.items.length,result.total));
}
