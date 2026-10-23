import {randomUUID} from 'node:crypto';
import {getPrisma} from '$lib/server/prisma';
import {Prisma} from '$lib/server/generated/prisma/client';
import type {AuthenticatedUser} from '$lib/server/auth/types';
import {requireOperationApi,writeAuditLog} from '$lib/server/api/admin';
import {throwApiError} from '$lib/server/api/response';
import {manifest,settings} from './contract';
import {isRetiredOfficial} from './retirement';
import {byteSize,isObject,onlyKeys,recordKey,valuesFor,initialRecordsFor,type Storage} from './storage-contract';

type Tx=Prisma.TransactionClient;
export async function readRecordBody(request:Request):Promise<unknown>{
 const reader=request.body?.getReader();if(!reader)return null;
 const chunks:Uint8Array[]=[];let length=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>98304){await reader.cancel();throwApiError(413,'RECORD_TOO_LARGE','Request is too large.');}chunks.push(value);}}
 finally{reader.releaseLock();}
 const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{return null;}
}
function actorFor(user:AuthenticatedUser|null,operation?:'create'|'update'|'delete'){
 const actor=requireOperationApi(user,'widgets.read');
 if(operation)requireOperationApi(actor,`widgets.records.${operation}`);
 return actor;
}
async function target(tx:Tx,actor:AuthenticatedUser,key:string,write=false){
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key))throwApiError(404,'NOT_FOUND','Widget not found.');
 const where={instanceKey:key,deletedAt:null,layout:{employeeId:actor.id,deletedAt:null}};
 if(write){
  await tx.$queryRaw`SELECT l.id FROM widget_layouts l JOIN widget_instances i ON i.layout_id=l.id WHERE i.instance_key=${key}::uuid AND l.employee_id=${actor.id} AND l.deleted_at IS NULL AND i.deleted_at IS NULL FOR UPDATE OF l,i`;
  await tx.$queryRaw`SELECT r.id FROM widget_instances i JOIN widget_releases r ON r.id=i.release_id JOIN widget_sources s ON s.id=r.source_id JOIN widget_approvals a ON a.release_id=r.id JOIN widget_layouts l ON l.id=i.layout_id WHERE i.instance_key=${key}::uuid AND l.employee_id=${actor.id} FOR SHARE OF r,s,a`;
 }
 const instance=await tx.widgetInstance.findFirst({where,include:{release:{include:{source:true,approval:true}}}});
 if(!instance||isRetiredOfficial(instance.release.widgetCode,instance.release.source.sourceKey))throwApiError(404,'NOT_FOUND','Widget not found.');
 if(!instance.enabled||instance.release.deletedAt||instance.release.source.deletedAt||!instance.release.approval?.allowed||instance.release.approval.deletedAt)throwApiError(403,'WIDGET_STOPPED','Widget disabled or stopped.');
 const definition=manifest(instance.release.definition);
 if(!definition.storage)throwApiError(400,'NO_WIDGET_STORAGE','Widget has no storage definition.');
 return {instance,definition,storage:definition.storage};
}
const publicRecord=(r:{recordKey:string;values:Prisma.JsonValue;revision:number;createdAt:Date;updatedAt:Date})=>({recordKey:r.recordKey,values:r.values,revision:r.revision,createdAt:r.createdAt,updatedAt:r.updatedAt});
function allowedOperations(actor:AuthenticatedUser,storage:Storage){
 return Object.fromEntries((['create','update','delete'] as const).map(op=>[op,storage.operations[op]&&actor.permissionOperations.includes(`widgets.records.${op}`)]));
}
export async function listRecords(user:AuthenticatedUser|null,key:string,q:{sortBy:string;sortOrder:'asc'|'desc';offset:number;limit:number}){
 const actor=actorFor(user);
 return getPrisma().$transaction(async tx=>{
  const {instance,storage}=await target(tx,actor,key);const where={instanceId:instance.id,deletedAt:null};
  const items=await tx.widgetRecord.findMany({where,orderBy:[{[q.sortBy]:q.sortOrder},{id:'asc'}],skip:q.offset,take:q.limit});
  const operations=allowedOperations(actor,storage);
  return {items:items.map(publicRecord),total:await tx.widgetRecord.count({where}),operations};
 });
}
export async function getRecord(user:AuthenticatedUser|null,key:string,rkey:string){
 const actor=actorFor(user);
 return getPrisma().$transaction(async tx=>{
  const {instance,storage}=await target(tx,actor,key);
  const row=recordKey(rkey)?await tx.widgetRecord.findFirst({where:{instanceId:instance.id,recordKey:rkey,deletedAt:null}}):null;
  if(!row)throwApiError(404,'NOT_FOUND','Record not found.');return {...publicRecord(row),operations:allowedOperations(actor,storage)};
 });
}
async function capacity(tx:Tx,instanceId:number,storage:Storage,values:unknown,excludeId?:number){
 const existing=await tx.widgetRecord.findMany({where:{instanceId,deletedAt:null,...(excludeId?{id:{not:excludeId}}:{})},select:{values:true}});
 if(existing.length+1>(storage.maxRecords??1000)||existing.reduce((n,r)=>n+byteSize(r.values),byteSize(values))>(storage.maxTotalBytes??1048576))throwApiError(422,'STORAGE_CAPACITY','Widget storage limit reached.');
}
export async function initializeRecords(tx:Tx,instanceId:number,storage:Storage|undefined,rows=initialRecordsFor(storage)){
 if(!storage)return;
 for(const row of rows)await tx.widgetRecord.create({data:{instanceId,recordKey:row.recordKey,values:row.values}});
}
export async function mutateRecord(user:AuthenticatedUser|null,key:string,operation:'create'|'update'|'delete',body:unknown,rkey?:string){
 const actor=actorFor(user,operation);
 if(!isObject(body)||!onlyKeys(body,operation==='create'?['recordKey','values']:operation==='update'?['revision','values','presentation']:['revision']))throwApiError(400,'INVALID_RECORD','Invalid record request.');
 if(operation!=='create'&&(!Number.isSafeInteger(body.revision)||Number(body.revision)<1))throwApiError(400,'INVALID_REVISION','A positive revision is required.');
 const selectedKey=operation==='create'?(body.recordKey===undefined?randomUUID():body.recordKey):rkey;
 if(!recordKey(selectedKey))throwApiError(400,'INVALID_RECORD_KEY','Invalid record key.');
 return getPrisma().$transaction(async tx=>{
  const {instance,definition,storage}=await target(tx,actor,key,true);
  if(!storage.operations[operation])throwApiError(403,'STORAGE_OPERATION_DISABLED','This record operation is disabled.');
  const old=await tx.widgetRecord.findUnique({where:{instanceId_recordKey:{instanceId:instance.id,recordKey:selectedKey}}});
  if(operation==='create'&&old)throwApiError(409,'RECORD_KEY_USED','Record key is already used.');
  if(operation!=='create'&&(!old||old.deletedAt))throwApiError(404,'NOT_FOUND','Record not found.');
  if(old&&old.revision!==body.revision)throwApiError(409,'RECORD_CONFLICT','Record changed. Reload before saving your draft.');
  let values:Record<string,string|number|boolean|string[]>={};
  if(operation!=='delete'){
   try{values=valuesFor(storage,body.values);}catch{throwApiError(400,'INVALID_RECORD_VALUES','Record values do not match the storage definition.');}
   await capacity(tx,instance.id,storage,values,old?.id);
  }
  let layoutRevision:number|undefined;
  if(body.presentation!==undefined){
   requireOperationApi(actor,'widgets.layout.update');const p=body.presentation;
   if(!isObject(p)||!onlyKeys(p,['size','settings','layoutRevision'])||!Number.isSafeInteger(p.layoutRevision))throwApiError(400,'INVALID_PRESENTATION','Invalid display settings.');
   let parsed:Record<string,string[]>;try{parsed=settings(definition,p.size,p.settings);}catch{throwApiError(400,'INVALID_SETTINGS','Invalid display settings.');}
   if((await tx.widgetLayout.updateMany({where:{id:instance.layoutId,deletedAt:null,revision:Number(p.layoutRevision)},data:{revision:{increment:1}}})).count!==1)throwApiError(409,'LAYOUT_CONFLICT','Layout changed. Reload before saving your draft.');
   await tx.widgetInstance.update({where:{id:instance.id},data:{size:String(p.size),settings:parsed}});layoutRevision=Number(p.layoutRevision)+1;
  }
  const row=operation==='create'?await tx.widgetRecord.create({data:{instanceId:instance.id,recordKey:selectedKey,values}}):await tx.widgetRecord.update({where:{id:old!.id},data:operation==='delete'?{deletedAt:new Date(),revision:{increment:1}}:{values,revision:{increment:1}}});
  await writeAuditLog(tx,actor.id,`${operation}_widget_record`,'widget_record',row.id,{instanceKey:key,recordKey:selectedKey});
  return {...publicRecord(row),...(layoutRevision===undefined?{}:{layoutRevision})};
 });
}
