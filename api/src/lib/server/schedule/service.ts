import { emitNotification } from '$lib/server/notifications/producer';
import { createHash } from 'node:crypto';
import { DateTime } from 'luxon';
import type { Prisma } from '$lib/server/generated/prisma/client';
import type { AuthenticatedUser } from '$lib/server/auth/types';
import { getPrisma } from '$lib/server/prisma';
import { throwApiError } from '$lib/server/api/response';
import { requireOperationApi,writeAuditLog } from '$lib/server/api/admin';
import { inputEvent, expandSlots, ScheduleInputError, type EventInput, type Slot } from './time';

export type Tx = Prisma.TransactionClient;
export const occurrenceInclude = { event:{include:{_count:{select:{occurrences:true}}}}, participants:{where:{deletedAt:null},include:{employee:{select:{id:true,employeeCode:true,firstName:true,lastName:true}}}},reservations:{where:{deletedAt:null,releasedAt:null},include:{resource:{include:{room:{select:{id:true,name:true,branchId:true}}}}}} } satisfies Prisma.ScheduleOccurrenceInclude;
export type Occurrence = Prisma.ScheduleOccurrenceGetPayload<{include:typeof occurrenceInclude}>;
function bad(code:string, message=code):never { return throwApiError(422,code,message); }
export const conflict = (code:string):never => throwApiError(409,code,'The record changed or a resource is unavailable.');
export function missing():never { return throwApiError(404,'SCHEDULE_UNAVAILABLE','This schedule is no longer available.'); }
export function eventInput(raw:unknown) { try { return inputEvent(raw); } catch(e) { if(e instanceof ScheduleInputError) throwApiError(422,e.reason,'Review the schedule fields.',[{field:e.field,reason:e.reason}]); throw e; } }
export function integer(value:unknown) { if(typeof value!=='number' || !Number.isSafeInteger(value) || value<1) bad('INVALID_ID'); return value; }
export function fullDetails(item:Occurrence, actor:AuthenticatedUser) { return item.visibility==='public' || item.event.organizerId===actor.id || item.participants.some(p=>p.employeeId===actor.id); }
export function present(item:Occurrence,actor:AuthenticatedUser) {
 const full=fullDetails(item,actor);
 const basics={key:item.occurrenceKey,start:item.allDay?item.startDate!.toISOString().slice(0,10):item.startsAt.toISOString(),end:item.allDay?item.endDate!.toISOString().slice(0,10):item.endsAt.toISOString(),allDay:item.allDay,timeZone:item.timeZone,canceled:!!item.canceledAt,detailAvailable:full};
 if(!full) return {...basics,title:null};
 return {...basics,eventKey:item.event.eventKey,revision:item.event.revision,sequence:item.sequence,recurring:!!(item.event.definition as unknown as EventInput).recurrence||item.event._count.occurrences>1,recurrence:recurrenceFor(item.event.definition,item.sequence).recurrence,recurrenceFromSequence:recurrenceFor(item.event.definition,item.sequence).fromSequence,isException:item.isException,title:item.title,description:item.description,location:item.location,visibility:item.visibility,organizerId:item.event.organizerId,participants:item.participants.map(p=>({employeeId:p.employeeId,name:[p.employee.lastName,p.employee.firstName].join(' '),response:p.response})),resources:item.reservations.map(r=>({id:r.resourceId,name:r.resource.room?.name ?? '',reservationId:r.id})),canEdit:item.event.organizerId===actor.id};
}
export async function getOccurrence(key:string) { if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key)) missing(); const item=await getPrisma().scheduleOccurrence.findFirst({where:{occurrenceKey:key,deletedAt:null,event:{deletedAt:null}},include:occurrenceInclude}); return item??missing(); }
export async function lockResources(tx:Tx, ids:number[]) {
 // Every writer locks this same set in ascending order. READ COMMITTED gives
 // the conflict query after the locks a fresh snapshot, including prior commits.
 for(const id of [...new Set(ids)].sort((a,b)=>a-b)) await tx.$queryRaw`SELECT id FROM reservable_resources WHERE id=${id} FOR UPDATE`;
}
export async function validateRefs(tx:Tx,input:EventInput,actor:AuthenticatedUser) {
 const ids=[...new Set(input.attendeeIds.filter(id=>id!==actor.id))];
 const today=new Date();
 const n=await tx.employee.count({where:{id:{in:ids},deletedAt:null,OR:[{retiredAt:null},{retiredAt:{gt:today}}]}});
 if(n!==ids.length) bad('INACTIVE_ATTENDEE');
 if(!await tx.employee.count({where:{id:actor.id,deletedAt:null,OR:[{retiredAt:null},{retiredAt:{gt:today}}]}})) bad('INACTIVE_ORGANIZER');
 for(const id of input.resourceIds) {
  const resource=await tx.reservableResource.findFirst({where:{id,kind:'room',isBookable:true,deletedAt:null,room:{deletedAt:null,branch:{deletedAt:null,OR:[{closedOn:null},{closedOn:{gt:today}}]}}}});
  if(!resource) bad('RESOURCE_NOT_BOOKABLE');
 }
 return ids;
}
export async function reservationSlot(tx:Tx,resourceId:number,slot:Slot,allDay:boolean) {
 if(!allDay) return slot;
 const resource=await tx.reservableResource.findUniqueOrThrow({where:{id:resourceId}});
 return {...slot,startsAt:DateTime.fromISO(slot.startDate!.toISOString().slice(0,10),{zone:resource.timeZone}).toJSDate(),endsAt:DateTime.fromISO(slot.endDate!.toISOString().slice(0,10),{zone:resource.timeZone}).toJSDate()};
}
export async function reserve(tx:Tx,occurrenceId:number,resourceIds:number[],slot:Slot,allDay:boolean) {
 for(const resourceId of resourceIds) {
  const time=await reservationSlot(tx,resourceId,slot,allDay);
  if(await tx.resourceReservation.count({where:{resourceId,occurrenceId:{not:occurrenceId},deletedAt:null,releasedAt:null,startsAt:{lt:time.endsAt},endsAt:{gt:time.startsAt}}})) conflict('ROOM_CONFLICT');
  await tx.resourceReservation.upsert({where:{occurrenceId_resourceId:{occurrenceId,resourceId}},create:{occurrenceId,resourceId,startsAt:time.startsAt,endsAt:time.endsAt},update:{startsAt:time.startsAt,endsAt:time.endsAt,deletedAt:null,releasedAt:null}});
 }
}
export async function notify(tx:Tx,type:string,targetKey:string,deduplicationKey:string,ids:number[]) {
 await emitNotification(tx,{type,version:1,source:'schedule',targetType:'schedule-occurrence',targetKey,deduplicationKey,recipientIds:ids});
}
function fields(input:EventInput,slot:Slot) { return {title:input.title,description:input.description,location:input.location,visibility:input.visibility,timeZone:input.timeZone,allDay:input.allDay,...slot}; }
export async function createEvent(actor:AuthenticatedUser,raw:unknown,key:string|null) {
 if(!key || !/^[\w-]{16,128}$/.test(key)) bad('IDEMPOTENCY_KEY_REQUIRED');
 const input=eventInput(raw);if(input.resourceIds.length)requireOperationApi(actor,'schedule.reserve');const hash=createHash('sha256').update(JSON.stringify(input)).digest('hex');
 return getPrisma().$transaction(async tx=>{
  // Serialize duplicate creates before checking the unique idempotency key.
  await tx.$queryRaw`SELECT id FROM employees WHERE id=${actor.id} FOR UPDATE`;
  const old=await tx.scheduleEvent.findUnique({where:{organizerId_idempotencyKey:{organizerId:actor.id,idempotencyKey:key}}});
  if(old) { if(old.requestHash!==hash) conflict('IDEMPOTENCY_KEY_REUSED'); const first=await tx.scheduleOccurrence.findFirstOrThrow({where:{eventId:old.id},orderBy:{sequence:'asc'}});return {key:first.occurrenceKey,replayed:true}; }
  await lockResources(tx,input.resourceIds);
  const ids=await validateRefs(tx,input,actor),slots=expandSlots(input);
  const event=await tx.scheduleEvent.create({data:{organizerId:actor.id,definition:{...input,identityZones:Object.fromEntries(slots.map((_,index)=>[index,input.timeZone]))} as unknown as Prisma.InputJsonValue,idempotencyKey:key,requestHash:hash}});
  let first='';
  for(const [sequence,slot] of slots.entries()) {
   const occurrence=await tx.scheduleOccurrence.create({data:{eventId:event.id,sequence,originalStart:slot.startsAt,...fields(input,slot),participants:{create:ids.map(employeeId=>({employeeId}))}}});
   first ||= occurrence.occurrenceKey;await reserve(tx,occurrence.id,input.resourceIds,slot,input.allDay);
  }
  await notify(tx,'schedule.invitation',first,`schedule:${event.eventKey}:1:invitation`,ids);
  await writeAuditLog(tx,actor.id,'create','schedule',event.id,{occurrences:slots.length});
  return {key:first,replayed:false};
 },{isolationLevel:'ReadCommitted',timeout:60000});
}
export type Mutation = {scope:'single'|'following'|'all';expectedRevision:number;input?:unknown;preserveExceptions?:boolean};
type SeriesDefinition = EventInput & {identityZones?:Record<string,string>;segments?:{fromSequence:number;input:EventInput}[]};
export function recurrenceFor(definition:unknown,sequence:number) {
 const d=definition as SeriesDefinition;
 const segment=[...(d.segments??[])].reverse().find(s=>s.fromSequence<=sequence);
 return {recurrence:segment?segment.input.recurrence:d.recurrence,fromSequence:segment?.fromSequence??0};
}
export function rebaseDate(input:EventInput,date:string):EventInput {
 const days=DateTime.fromISO(input.end.slice(0,10),{zone:'UTC'}).diff(DateTime.fromISO(input.start.slice(0,10),{zone:'UTC'}),'days').days;
 const end=DateTime.fromISO(date,{zone:'UTC'}).plus({days}).toISODate()!;
 return {...input,start:input.allDay?date:date+input.start.slice(10),end:input.allDay?end:end+input.end.slice(10)};
}
export async function mutateEvent(actor:AuthenticatedUser,key:string,body:Mutation,cancel=false) {
 if(!body || !['single','following','all'].includes(body.scope) || !Number.isSafeInteger(body.expectedRevision) || body.preserveExceptions!==undefined&&typeof body.preserveExceptions!=='boolean') bad('INVALID_MUTATION');
 const input=cancel?null:eventInput(body.input);if(input?.resourceIds.length)requireOperationApi(actor,'schedule.reserve');
 if(input && body.scope==='single' && input.recurrence)bad('SINGLE_EDIT_CANNOT_REPEAT');
 return getPrisma().$transaction(async tx=>{
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key))missing();
  const initial=await tx.scheduleOccurrence.findFirst({where:{occurrenceKey:key,deletedAt:null},include:{event:true}});if(!initial || initial.event.deletedAt)missing();
  if(initial.event.organizerId!==actor.id)throwApiError(403,'ORGANIZER_REQUIRED','Only the organizer can change this event.');
  await tx.$queryRaw`SELECT id FROM schedule_events WHERE id=${initial.eventId} FOR UPDATE`;
  const event=await tx.scheduleEvent.findUniqueOrThrow({where:{id:initial.eventId}});
  if(event.revision!==body.expectedRevision)conflict('STALE_REVISION');
  const all=await tx.scheduleOccurrence.findMany({where:{eventId:event.id,deletedAt:null},include:occurrenceInclude,orderBy:{sequence:'asc'}});
  const anchor=all.find(i=>i.id===initial.id)!;
  const definition=event.definition as unknown as SeriesDefinition;const identityZones={...Object.fromEntries(all.map(i=>[i.sequence,i.timeZone])),...(definition.identityZones??{})};
  if(anchor.canceledAt&&!cancel)conflict('SCHEDULE_CANCELED');
  const from=body.scope==='all'?0:anchor.sequence;
  const existing=all.filter(i=>body.scope==='single'?i.id===anchor.id:i.sequence>=from);
  let changedInput=input;
  if(input&&body.scope==='all') {
   const original=DateTime.fromJSDate(anchor.originalStart,{zone:identityZones[anchor.sequence]}).toISODate()!;
   const shift=DateTime.fromISO(input.start.slice(0,10),{zone:'UTC'}).diff(DateTime.fromISO(original,{zone:'UTC'}),'days').days;
   const first=all[0];const date=DateTime.fromJSDate(first.originalStart,{zone:identityZones[first.sequence]}).plus({days:shift}).toISODate()!;
   changedInput=rebaseDate(input,date);
  }
  let slots:Slot[]=[];
  try {if(changedInput)slots=expandSlots(changedInput);} catch(e){if(e instanceof ScheduleInputError)throwApiError(422,e.reason,'Review the recurrence.',[{field:e.field,reason:e.reason}]);throw e;}
  if(!cancel&&body.scope!=='single'&&from+slots.length>366)bad('MAXIMUM_366_OCCURRENCES');
  if(!cancel&&body.scope==='following') {
   const before=all.filter(i=>i.sequence<from&&!i.canceledAt&&!i.isException);
   const first=Math.min(...before.map(i=>i.startsAt.getTime()),...slots.map(s=>s.startsAt.getTime()));
   const last=Math.max(...slots.map(s=>s.startsAt.getTime()));
   if(last>DateTime.fromMillis(first,{zone:input!.timeZone}).plus({years:1}).toMillis())bad('MAXIMUM_ONE_YEAR');
  }
  const preserved=existing.filter(i=>body.scope!=='single'&&i.isException&&body.preserveExceptions!==false);
  const preservedIds=new Set(preserved.map(i=>i.id));
  const affected=existing.filter(i=>!preservedIds.has(i.id));
  await lockResources(tx,[...affected.flatMap(i=>i.reservations.map(r=>r.resourceId)),...(input?.resourceIds??[])]);
  const ids=input?await validateRefs(tx,input,actor):[],notifyIds=new Set<number>();
  for(const item of affected) {
   for(const p of item.participants)notifyIds.add(p.employeeId);
   await tx.resourceReservation.updateMany({where:{occurrenceId:item.id,deletedAt:null},data:{deletedAt:new Date()}});
  }
  const previousRecipients=new Set(notifyIds);
  let resultKey='',changed=0;
  if(cancel) {
   for(const item of affected) {resultKey ||= item.occurrenceKey;changed++;await tx.scheduleOccurrence.update({where:{id:item.id},data:{canceledAt:new Date(),isException:body.scope==='single'||item.isException}});}
  } else {
   // Sequence is an immutable position identity. Regenerating a rule reuses that
   // identity, preserves selected explicit exceptions, and cancels surplus rows.
   // New positions get new keys; past notifications continue targeting old keys.
   const bySequence=new Map(existing.map(i=>[i.sequence,i]));
   for(const [index,slot] of slots.entries()) {
    const sequence=body.scope==='single'?anchor.sequence:from+index,old=bySequence.get(sequence);
    if(old&&preservedIds.has(old.id))continue;
    const data=fields(input!,slot);let occurrenceId:number;
    if(old) {
     const reset=!!old.canceledAt||old.startsAt.getTime()!==slot.startsAt.getTime()||old.endsAt.getTime()!==slot.endsAt.getTime()||old.allDay!==input!.allDay||JSON.stringify(old.participants.map(p=>p.employeeId).sort((a,b)=>a-b))!==JSON.stringify([...ids].sort((a,b)=>a-b));
     const updated=await tx.scheduleOccurrence.update({where:{id:old.id},data:{...data,canceledAt:null,isException:body.scope==='single'}});occurrenceId=old.id;resultKey ||= updated.occurrenceKey;
     await tx.scheduleParticipant.updateMany({where:{occurrenceId,employeeId:{notIn:ids},deletedAt:null},data:{deletedAt:new Date()}});
     for(const employeeId of ids)await tx.scheduleParticipant.upsert({where:{occurrenceId_employeeId:{occurrenceId,employeeId}},create:{occurrenceId,employeeId},update:{deletedAt:null,...(reset?{response:'pending'}:{})}});
    } else {
     identityZones[sequence]=input!.timeZone;const added=await tx.scheduleOccurrence.create({data:{eventId:event.id,sequence,originalStart:slot.startsAt,...data,participants:{create:ids.map(employeeId=>({employeeId}))}}});occurrenceId=added.id;resultKey ||= added.occurrenceKey;
    }
    changed++;for(const id of ids)notifyIds.add(id);await reserve(tx,occurrenceId,input!.resourceIds,slot,input!.allDay);
   }
   for(const old of affected.filter(i=>body.scope!=='single'&&i.sequence>=from+slots.length)) {resultKey ||= old.occurrenceKey;changed++;await tx.scheduleOccurrence.update({where:{id:old.id},data:{canceledAt:new Date()}});}
  }
  if(!changed)bad('NO_OCCURRENCES_CHANGED');
  let nextDefinition:SeriesDefinition|undefined;
  if(changedInput&&body.scope==='all')nextDefinition={...changedInput,identityZones};
  else if(changedInput&&body.scope==='following')nextDefinition={...definition,identityZones,segments:[...(definition.segments??[]).filter(s=>s.fromSequence<from),{fromSequence:from,input:changedInput}]};
  if(input&&body.scope==='single')nextDefinition={...definition,identityZones};
  await tx.scheduleEvent.update({where:{id:event.id},data:{revision:{increment:1},...(nextDefinition?{definition:nextDefinition as unknown as Prisma.InputJsonValue}:{})}});
  notifyIds.delete(actor.id);const invited=cancel?[]:[...notifyIds].filter(id=>!previousRecipients.has(id));
  await notify(tx,cancel?'schedule.cancellation':'schedule.change',resultKey,`schedule:${event.eventKey}:${event.revision+1}:${cancel?'cancel':'change'}`,[...notifyIds].filter(id=>!invited.includes(id)));
  await notify(tx,'schedule.invitation',resultKey,`schedule:${event.eventKey}:${event.revision+1}:invitation`,invited);
  await writeAuditLog(tx,actor.id,cancel?'cancel':'update','schedule',event.id,{scope:body.scope,changed,preserved:preserved.length});
  return {key:resultKey,changed,preserved:preserved.length,revision:event.revision+1};
 },{isolationLevel:'ReadCommitted',timeout:60000});
}
export async function respond(actor:AuthenticatedUser,key:string,response:unknown,revision:unknown) {
 if(!['accepted','tentative','declined'].includes(String(response))) bad('INVALID_RESPONSE');
 return getPrisma().$transaction(async tx=>{
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key)) missing();
  let item=await tx.scheduleOccurrence.findFirst({where:{occurrenceKey:key,deletedAt:null},include:occurrenceInclude});if(!item) missing();
  await tx.$queryRaw`SELECT id FROM schedule_events WHERE id=${item.eventId} FOR UPDATE`;
  const event=await tx.scheduleEvent.findUniqueOrThrow({where:{id:item.eventId}});
  item=await tx.scheduleOccurrence.findFirst({where:{id:item.id,deletedAt:null},include:occurrenceInclude});if(!item) missing();
  if(event.revision!==revision) conflict('STALE_REVISION');
  if(item.canceledAt || event.deletedAt) conflict('SCHEDULE_CANCELED');
  const p=item.participants.find(p=>p.employeeId===actor.id);if(!p) throwApiError(403,'PARTICIPANT_REQUIRED','Only the participant can respond.');
  if(p.response!==response) {
   const changed=await tx.scheduleParticipant.update({where:{id:p.id},data:{response:String(response)}});
   await notify(tx,'schedule.response',key,`response:${p.id}:${changed.updatedAt.toISOString()}`,[event.organizerId]);
  }
  return {response};
 },{isolationLevel:'ReadCommitted'});
}
