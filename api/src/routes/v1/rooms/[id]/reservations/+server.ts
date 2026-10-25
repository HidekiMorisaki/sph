import { requireLocationManagementApi } from '$lib/server/api/branch-access';
import { requireSystemAdminApi } from '$lib/server/api/admin';
import { success,throwApiError } from '$lib/server/api/response';
import { parseListQuery,listMeta } from '$lib/server/api/query';
import { getPrisma } from '$lib/server/prisma';
export async function GET({locals,params,url}:import('./$types').RequestEvent) {
 const {branchId}=requireLocationManagementApi(requireSystemAdminApi(locals.user)),id=Number(params.id),q=parseListQuery(url,['startsAt'],'startsAt'),db=getPrisma();
 if(!Number.isSafeInteger(id)||id<1||!await db.room.count({where:{id,deletedAt:null,...(branchId===null?{}:{branchId})}}))throwApiError(404,'NOT_FOUND','Not found.');
 const where={deletedAt:null,releasedAt:null,endsAt:{gt:new Date()},resource:{roomId:id,deletedAt:null}};
 const [items,total]=await Promise.all([db.resourceReservation.findMany({where,select:{id:true,startsAt:true,endsAt:true},orderBy:[{startsAt:q.sortOrder},{id:q.sortOrder}],skip:q.offset,take:q.limit}),db.resourceReservation.count({where})]);
 // Room administration never grants access to private event bodies or people.
 return success(items,200,listMeta(q,items.length,total));
}
