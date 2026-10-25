import { requireLocationManagementApi } from '$lib/server/api/branch-access';
import { requireSystemAdminApi,writeAuditLog } from '$lib/server/api/admin';
import { success,throwApiError } from '$lib/server/api/response';
import { getPrisma } from '$lib/server/prisma';
import { zone,ScheduleInputError } from '$lib/server/schedule/time';
import { lockResources,conflict } from '$lib/server/schedule/service';
export async function GET({locals,params}:import('./$types').RequestEvent) {
 const {branchId}=requireLocationManagementApi(requireSystemAdminApi(locals.user)),id=Number(params.id);
 const room=Number.isSafeInteger(id)?await getPrisma().room.findFirst({where:{id,deletedAt:null,...(branchId===null?{}:{branchId})},include:{reservableResource:true}}):null;
 if(!room) throwApiError(404,'NOT_FOUND','Not found.');
 const r=room.reservableResource;
 return success({roomId:id,resourceId:r?.id??null,isBookable:r?.isBookable??false,timeZone:r?.timeZone??'',revision:r?.revision??0});
}
export async function PUT({locals,params,request}:import('./$types').RequestEvent) {
 const {actor,branchId}=requireLocationManagementApi(requireSystemAdminApi(locals.user)),id=Number(params.id),b=await request.json().catch(()=>null);
 if(!Number.isSafeInteger(id)||id<1||typeof b?.isBookable!=='boolean'||!Number.isSafeInteger(b.expectedRevision)) throwApiError(422,'INVALID_REQUEST','Invalid booking settings.');
 let timeZone:string;try {timeZone=zone(b.timeZone);} catch(e) {if(e instanceof ScheduleInputError) throwApiError(422,'INVALID_TIME_ZONE','Choose an IANA time zone.');throw e;}
 const resource=await getPrisma().$transaction(async tx=>{
  await tx.$queryRaw`SELECT id FROM rooms WHERE id=${id} FOR UPDATE`;
  const room=await tx.room.findFirst({where:{id,deletedAt:null,...(branchId===null?{}:{branchId})},include:{branch:true,reservableResource:true}});
  if(!room) throwApiError(404,'NOT_FOUND','Not found.');
  if(b.isBookable && (room.branch.deletedAt || room.branch.closedOn && room.branch.closedOn<=new Date())) throwApiError(422,'CLOSED_BRANCH','The branch is closed.');
  const old=room.reservableResource;if(old)await lockResources(tx,[old.id]);
  if((old?.revision??0)!==b.expectedRevision) conflict('STALE_REVISION');
  if(old && (!b.isBookable || old.timeZone!==timeZone) && await tx.resourceReservation.count({where:{resourceId:old.id,deletedAt:null,releasedAt:null,endsAt:{gt:new Date()}}})) conflict('FUTURE_RESERVATIONS');
  const r=await tx.reservableResource.upsert({where:{roomId:id},create:{kind:'room',roomId:id,isBookable:b.isBookable,timeZone},update:{isBookable:b.isBookable,timeZone,revision:{increment:1},deletedAt:null}});
  await writeAuditLog(tx,actor.id,'booking-settings','room',id,{isBookable:b.isBookable,timeZone});return r;
 },{isolationLevel:'ReadCommitted'});
 return success({roomId:id,resourceId:resource.id,isBookable:resource.isBookable,timeZone:resource.timeZone,revision:resource.revision});
}
