import { requireOperationApi } from '$lib/server/api/admin';
import { success,throwApiError } from '$lib/server/api/response';
import { getPrisma } from '$lib/server/prisma';
import { DateTime } from 'luxon';
import { eventInput,rebaseDate,reservationSlot } from '$lib/server/schedule/service';
import { expandSlots } from '$lib/server/schedule/time';
export async function POST({locals,request}:import('./$types').RequestEvent) {
 const actor=requireOperationApi(locals.user,'schedule.read'),body=await request.json().catch(()=>null),input=eventInput(body?.input),db=getPrisma();
 const employeeIds=[...new Set([actor.id,...input.attendeeIds])],resourceIds=input.resourceIds;
 if(await db.employee.count({where:{id:{in:employeeIds},deletedAt:null,OR:[{retiredAt:null},{retiredAt:{gt:new Date()}}]}})!==employeeIds.length || await db.reservableResource.count({where:{id:{in:resourceIds},kind:'room',isBookable:true,deletedAt:null,room:{deletedAt:null,branch:{deletedAt:null,OR:[{closedOn:null},{closedOn:{gt:new Date()}}]}}}})!==resourceIds.length)throwApiError(422,'UNAVAILABLE_REFERENCE','An attendee or room is unavailable.');
 const excluded=typeof body.exclude==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.exclude)?await db.scheduleOccurrence.findFirst({where:{occurrenceKey:body.exclude,deletedAt:null,event:{organizerId:actor.id,deletedAt:null}},include:{event:{select:{definition:true}}}}):null;
 const rows=excluded?await db.scheduleOccurrence.findMany({where:{eventId:excluded.eventId,deletedAt:null},orderBy:{sequence:'asc'}}):[];
 const from=body.scope==='all'?0:excluded?.sequence??0;
 const affected=rows.filter(r=>body.scope==='single'?r.id===excluded?.id:r.sequence>=from);
 const preserved=affected.filter(r=>body.scope!=='single'&&r.isException&&body.preserveExceptions!==false);
 const excludedIds=affected.filter(r=>!preserved.some(p=>p.id===r.id)).map(r=>r.id);
 const excludeWhere=excluded?{id:{notIn:excludedIds}}:{};
 let projected=input;
 if(excluded&&body.scope==='all') {
  const identityZones=(excluded.event.definition as {identityZones?:Record<string,string>}).identityZones??{};
  const original=DateTime.fromJSDate(excluded.originalStart,{zone:identityZones[excluded.sequence]??excluded.timeZone}).toISODate()!;
  const shift=DateTime.fromISO(input.start.slice(0,10),{zone:'UTC'}).diff(DateTime.fromISO(original,{zone:'UTC'}),'days').days;
  projected=rebaseDate(input,DateTime.fromJSDate(rows[0].originalStart,{zone:identityZones[rows[0].sequence]??rows[0].timeZone}).plus({days:shift}).toISODate()!);
 }
 const allSlots=expandSlots(eventInput(projected));
 const slots=allSlots.filter((_,index)=>!preserved.some(p=>p.sequence===from+index));
 const canceledCount=affected.filter(r=>!preserved.some(p=>p.id===r.id)&&r.sequence>=from+allSlots.length).length;
 if(!slots.length)throwApiError(422,'NO_OCCURRENCES_CHANGED','No occurrences would change.');
 const start=new Date(Math.min(...slots.map(s=>s.startsAt.getTime()))-86400000),end=new Date(Math.max(...slots.map(s=>s.endsAt.getTime()))+86400000);
 const items=await db.scheduleOccurrence.findMany({where:{deletedAt:null,canceledAt:null,event:{deletedAt:null},startsAt:{lt:end},endsAt:{gt:start},...excludeWhere,OR:[{event:{organizerId:{in:employeeIds}}},{participants:{some:{employeeId:{in:employeeIds},deletedAt:null,response:{not:'declined'}}}}]},select:{id:true,startsAt:true,endsAt:true,event:{select:{organizerId:true}},participants:{where:{deletedAt:null,response:{not:'declined'}},select:{employeeId:true}}}});
 const reservations=await db.resourceReservation.findMany({where:{resourceId:{in:resourceIds},deletedAt:null,releasedAt:null,startsAt:{lt:end},endsAt:{gt:start},occurrence:excludeWhere},select:{resourceId:true,startsAt:true,endsAt:true}});
 const resourceSlots=new Map<number,typeof slots>();for(const id of resourceIds)resourceSlots.set(id,await Promise.all(slots.map(s=>reservationSlot(db,id,s,input.allDay))));
 return success({affectedCount:slots.length+canceledCount,preservedCount:preserved.length,canceledCount,employees:employeeIds.map(id=>({id,busy:items.filter(i=>(i.event.organizerId===id||i.participants.some(p=>p.employeeId===id))&&slots.some(s=>i.startsAt<s.endsAt&&i.endsAt>s.startsAt)).map(i=>({start:i.startsAt,end:i.endsAt}))})),resources:resourceIds.map(id=>({id,busy:reservations.filter(r=>r.resourceId===id&&resourceSlots.get(id)!.some(s=>r.startsAt<s.endsAt&&r.endsAt>s.startsAt)).map(r=>({start:r.startsAt,end:r.endsAt}))}))});
}
export async function GET({locals,url}:import('./$types').RequestEvent) {
 const actor=requireOperationApi(locals.user,'schedule.read');
 const start=new Date(url.searchParams.get('start')??''),end=new Date(url.searchParams.get('end')??'');
 const parse=(key:string,max:number)=>{const value=url.searchParams.get(key);const ids=value?value.split(',').map(Number):[];if(ids.length>max||ids.some(id=>!Number.isSafeInteger(id)||id<1))throwApiError(422,'INVALID_IDS','Invalid availability request.');return ids;};
 const employeeIds=parse('employees',201),resourceIds=parse('resources',1),excluded=url.searchParams.get('exclude');
 if(!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||end<=start||end.getTime()-start.getTime()>366*86400000||excluded&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(excluded))throwApiError(422,'INVALID_RANGE','Invalid range.');
 const db=getPrisma();
 if(await db.employee.count({where:{id:{in:employeeIds},deletedAt:null}})!==new Set(employeeIds).size||await db.reservableResource.count({where:{id:{in:resourceIds},kind:'room',deletedAt:null,isBookable:true}})!==new Set(resourceIds).size)throwApiError(422,'UNAVAILABLE_REFERENCE','A calendar is unavailable.');
 const excludedItem=excluded?await db.scheduleOccurrence.findFirst({where:{occurrenceKey:excluded,deletedAt:null,event:{organizerId:actor.id}}}):null;
 const items=await db.scheduleOccurrence.findMany({where:{deletedAt:null,canceledAt:null,event:{deletedAt:null},startsAt:{lt:end},endsAt:{gt:start},...(excludedItem?{id:{not:excludedItem.id}}:{}),OR:[{event:{organizerId:{in:employeeIds}}},{participants:{some:{employeeId:{in:employeeIds},deletedAt:null,response:{not:'declined'}}}}]},select:{startsAt:true,endsAt:true,event:{select:{organizerId:true}},participants:{where:{deletedAt:null,response:{not:'declined'}},select:{employeeId:true}}}});
 const reservations=await db.resourceReservation.findMany({where:{resourceId:{in:resourceIds},deletedAt:null,releasedAt:null,startsAt:{lt:end},endsAt:{gt:start},...(excludedItem?{occurrenceId:{not:excludedItem.id}}:{})},select:{resourceId:true,startsAt:true,endsAt:true}});
 return success({employees:employeeIds.map(id=>({id,busy:items.filter(i=>i.event.organizerId===id||i.participants.some(p=>p.employeeId===id)).map(i=>({start:i.startsAt,end:i.endsAt}))})),resources:resourceIds.map(id=>({id,busy:reservations.filter(r=>r.resourceId===id).map(r=>({start:r.startsAt,end:r.endsAt}))}))});
}
