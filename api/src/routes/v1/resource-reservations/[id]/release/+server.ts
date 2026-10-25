import { randomUUID } from 'node:crypto';
import { requireOperationApi,requireSystemAdminApi,writeAuditLog } from '$lib/server/api/admin';
import { success,throwApiError } from '$lib/server/api/response';
import { getPrisma } from '$lib/server/prisma';
import { lockResources,notify,missing } from '$lib/server/schedule/service';
export async function PUT({locals,params,request}:import('./$types').RequestEvent) {
 const actor=requireOperationApi(requireSystemAdminApi(locals.user),'schedule.reservations.release'),id=Number(params.id),b=await request.json().catch(()=>null);
 if(!Number.isSafeInteger(id)||id<1||typeof b?.reason!=='string'||!b.reason.trim()||b.reason.length>1000) throwApiError(422,'REASON_REQUIRED','Enter a release reason.');
 await getPrisma().$transaction(async tx=>{
  const first=await tx.resourceReservation.findFirst({where:{id,deletedAt:null,releasedAt:null}});if(!first)missing();await lockResources(tx,[first.resourceId]);
  const item=await tx.resourceReservation.findFirst({where:{id,deletedAt:null,releasedAt:null},include:{occurrence:{include:{event:true,participants:{where:{deletedAt:null}}}}}});if(!item)missing();
  await tx.resourceReservation.update({where:{id},data:{releasedAt:new Date()}});
  await writeAuditLog(tx,actor.id,'release','resource-reservation',id,{reason:b.reason.trim()});
  const o=item.occurrence;await notify(tx,'schedule.resource-release',o.occurrenceKey,`release:${id}:${randomUUID()}`,[o.event.organizerId,...o.participants.map(p=>p.employeeId)]);
 },{isolationLevel:'ReadCommitted'});
 return success({released:true});
}
