import { requireOperationApi } from '$lib/server/api/admin';
import { success } from '$lib/server/api/response';
import { parseListQuery,parseSearch,listMeta } from '$lib/server/api/query';
import { getPrisma } from '$lib/server/prisma';
export async function GET({locals,url}:import('./$types').RequestEvent) {
 requireOperationApi(locals.user,'schedule.read');const q=parseListQuery(url,['id'],'id'),search=parseSearch(url);
 const where={kind:'room',isBookable:true,deletedAt:null,room:{deletedAt:null,name:{contains:search,mode:'insensitive' as const},branch:{deletedAt:null,OR:[{closedOn:null},{closedOn:{gt:new Date()}}]}}};
 const db=getPrisma(),[items,total]=await Promise.all([db.reservableResource.findMany({where,include:{room:{select:{id:true,name:true,branch:{select:{id:true,name:true}}}}},skip:q.offset,take:q.limit,orderBy:{id:q.sortOrder}}),db.reservableResource.count({where})]);
 return success(items.map(i=>({id:i.id,kind:i.kind,timeZone:i.timeZone,room:i.room})),200,listMeta(q,items.length,total));
}
