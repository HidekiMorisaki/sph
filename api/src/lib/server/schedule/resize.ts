import { DateTime } from 'luxon';
import type { Prisma } from '#lib/server/generated/prisma/client.js';
import type { AuthenticatedUser } from '#lib/server/auth/types.js';
import { getPrisma } from '#lib/server/prisma.js';
import { requireOperationApi,writeAuditLog } from '#lib/server/api/admin.js';
import { throwApiError } from '#lib/server/api/response.js';
import { eventInput,occurrenceInclude,missing,conflict,lockResources,validateRefs,reservationSlot,reserve,notify } from './service';
import { expandSlots,type EventInput } from './time';

const invalid=(code='INVALID_RESIZE'):never=>throwApiError(422,code,'Review the schedule time change.');
const wall=(value:string)=>DateTime.fromISO(value,{zone:'UTC'});
function shiftedInput(input:EventInput,delta:number,explicitOffset?:number):EventInput {
 const end=wall(input.end).plus({milliseconds:delta}).toFormat(input.allDay?'yyyy-MM-dd':"yyyy-MM-dd'T'HH:mm");
 const date=DateTime.fromISO(end,{zone:input.timeZone});
 const choices=date.getPossibleOffsets();
 if(!input.allDay&&choices.length>1&&explicitOffset===undefined)invalid('AMBIGUOUS_LOCAL_TIME_SELECT_OFFSET');
 return eventInput({...input,end,...(!input.allDay?{endOffset:explicitOffset??date.offset}:{})});
}

// A time-only update preserves each occurrence's title, attendees and bookings.
// Preview performs the same ownership/revision/reference/conflict checks without writes.
export async function resizeEvent(actor:AuthenticatedUser,key:string,raw:unknown) {
 if(!raw||typeof raw!=='object'||Array.isArray(raw))invalid();
 const body=raw as {scope?:unknown;expectedRevision?:unknown;resize?:{end?:unknown};preview?:unknown;notifyParticipants?:unknown;acceptEmployeeConflict?:unknown;input?:unknown};
 if(!['single','all'].includes(String(body.scope))||!Number.isSafeInteger(body.expectedRevision)||!body.resize||typeof body.resize.end!=='string'||body.input!==undefined||[body.preview,body.notifyParticipants,body.acceptEmployeeConflict].some(value=>value!==undefined&&typeof value!=='boolean'))invalid();
 return getPrisma().$transaction(async tx=>{
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key))missing();
  const first=await tx.scheduleOccurrence.findFirst({where:{occurrenceKey:key,deletedAt:null,event:{deletedAt:null}},include:{event:true}});
  if(!first)missing();
  if(first.event.organizerId!==actor.id)throwApiError(403,'ORGANIZER_REQUIRED','Only the organizer can resize this event.');
  await tx.$queryRaw`SELECT id FROM schedule_events WHERE id=${first.eventId} FOR UPDATE`;
  const event=await tx.scheduleEvent.findUniqueOrThrow({where:{id:first.eventId}});
  if(event.deletedAt)missing();
  if(event.revision!==body.expectedRevision)conflict('STALE_REVISION');
  const all=await tx.scheduleOccurrence.findMany({where:{eventId:event.id,deletedAt:null},include:occurrenceInclude,orderBy:{sequence:'asc'}});
  const anchor=all.find(item=>item.id===first.id)!;
  if(anchor.canceledAt)conflict('SCHEDULE_CANCELED');
  const targets=body.scope==='single'?[anchor]:all.filter(item=>!item.canceledAt);
  const end=String(body.resize!.end);
  if(anchor.allDay?!/^\d{4}-\d{2}-\d{2}$/.test(end):!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(end))invalid();
  const proposed=DateTime.fromISO(end,{zone:anchor.timeZone});if(!proposed.isValid)invalid();
  const oldEnd=anchor.allDay?anchor.endDate!.toISOString().slice(0,10):DateTime.fromJSDate(anchor.endsAt,{zone:anchor.timeZone}).toFormat("yyyy-MM-dd'T'HH:mm");
  const localEnd=proposed.toFormat(anchor.allDay?'yyyy-MM-dd':"yyyy-MM-dd'T'HH:mm");
  const delta=wall(localEnd).toMillis()-wall(oldEnd).toMillis();
  if(!delta)invalid('NO_OCCURRENCES_CHANGED');
  const prepared=targets.map(item=>{
   const input:EventInput={title:item.title,description:item.description,location:item.location,visibility:item.visibility as EventInput['visibility'],timeZone:item.timeZone,allDay:item.allDay,
    start:item.allDay?item.startDate!.toISOString().slice(0,10):DateTime.fromJSDate(item.startsAt,{zone:item.timeZone}).toFormat("yyyy-MM-dd'T'HH:mm"),
    end:item.allDay?item.endDate!.toISOString().slice(0,10):DateTime.fromJSDate(item.endsAt,{zone:item.timeZone}).toFormat("yyyy-MM-dd'T'HH:mm"),
    ...(!item.allDay?{startOffset:DateTime.fromJSDate(item.startsAt,{zone:item.timeZone}).offset}:{}),
    attendeeIds:item.participants.map(participant=>participant.employeeId).filter(id=>id!==actor.id),resourceIds:item.reservations.map(reservation=>reservation.resourceId),recurrence:null};
   const changed=shiftedInput(input,delta,item.id===anchor.id&&!item.allDay?proposed.offset:undefined);
   return {item,input:changed,slot:expandSlots(changed)[0]};
  });
  if(prepared.some(change=>change.input.resourceIds.length))requireOperationApi(actor,'schedule.reserve');
  await lockResources(tx,prepared.flatMap(change=>change.input.resourceIds));
  const affectedIds=targets.map(item=>item.id),recipients=[...new Set(prepared.flatMap(change=>change.input.attendeeIds))];
  let employeeConflict=false;
  const roomSlots:{resourceId:number;start:Date;end:Date}[]=[];
  for(const change of prepared){
   await validateRefs(tx,change.input,actor);
   const ids=[actor.id,...change.input.attendeeIds];
   if(await tx.scheduleOccurrence.count({where:{id:{notIn:affectedIds},deletedAt:null,canceledAt:null,event:{deletedAt:null},startsAt:{lt:change.slot.endsAt},endsAt:{gt:change.slot.startsAt},OR:[{event:{organizerId:{in:ids}}},{participants:{some:{employeeId:{in:ids},deletedAt:null,response:{not:'declined'}}}}]}}))employeeConflict=true;
   for(const resourceId of change.input.resourceIds){
    const slot=await reservationSlot(tx,resourceId,change.slot,change.input.allDay);
    if(roomSlots.some(old=>old.resourceId===resourceId&&old.start<slot.endsAt&&old.end>slot.startsAt)||await tx.resourceReservation.count({where:{resourceId,occurrenceId:{notIn:affectedIds},deletedAt:null,releasedAt:null,startsAt:{lt:slot.endsAt},endsAt:{gt:slot.startsAt}}}))conflict('ROOM_CONFLICT');
    roomSlots.push({resourceId,start:slot.startsAt,end:slot.endsAt});
   }
  }
  for(let index=0;index<prepared.length;index++)for(const other of prepared.slice(index+1))if(prepared[index].slot.startsAt<other.slot.endsAt&&prepared[index].slot.endsAt>other.slot.startsAt)employeeConflict=true;
  // Keep recurrence rules consistent while preserving occurrence-specific metadata.
  const definition=event.definition as unknown as EventInput&{segments?:{fromSequence:number;input:EventInput}[]};
  const nextDefinition=body.scope==='all'?{...definition,...shiftedInput(definition,delta),...(definition.segments?{segments:definition.segments.map(segment=>({...segment,input:shiftedInput(segment.input,delta)}))}:{})}:undefined;
  if(body.preview===true)return {key,changed:prepared.length,notifyRequired:recipients.length>0,employeeConflict,revision:event.revision};
  if(recipients.length&&typeof body.notifyParticipants!=='boolean')invalid('NOTIFICATION_CHOICE_REQUIRED');
  if(employeeConflict&&body.acceptEmployeeConflict!==true)conflict('EMPLOYEE_CONFLICT_CONFIRMATION_REQUIRED');
  await tx.resourceReservation.updateMany({where:{occurrenceId:{in:affectedIds},deletedAt:null},data:{deletedAt:new Date()}});
  for(const change of prepared){
   await tx.scheduleOccurrence.update({where:{id:change.item.id},data:{endsAt:change.slot.endsAt,endDate:change.slot.endDate,...(body.scope==='single'?{isException:true}:{})}});
   await tx.scheduleParticipant.updateMany({where:{occurrenceId:change.item.id,deletedAt:null},data:{response:'pending'}});
   await reserve(tx,change.item.id,change.input.resourceIds,change.slot,change.input.allDay);
  }
  await tx.scheduleEvent.update({where:{id:event.id},data:{revision:{increment:1},...(nextDefinition?{definition:nextDefinition as unknown as Prisma.InputJsonValue}:{})}});
  if(body.notifyParticipants===true)await notify(tx,'schedule.change',key,`schedule:${event.eventKey}:${event.revision+1}:resize`,recipients);
  await writeAuditLog(tx,actor.id,'update','schedule',event.id,{scope:String(body.scope),changed:prepared.length,resize:true,notifyParticipants:body.notifyParticipants===true});
  return {key,changed:prepared.length,notifyRequired:recipients.length>0,employeeConflict,revision:event.revision+1};
 },{isolationLevel:'ReadCommitted',timeout:60000});
}
