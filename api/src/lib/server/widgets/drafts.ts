import {getPrisma} from '$lib/server/prisma';
import {Prisma} from '$lib/server/generated/prisma/client';
import {requireOperationApi,writeAuditLog} from '$lib/server/api/admin';
import {throwApiError} from '$lib/server/api/response';
import type {AuthenticatedUser} from '$lib/server/auth/types';
export function draftActor(user:AuthenticatedUser|null,op:'read'|'create'|'update'|'delete'){
 requireOperationApi(user,'widgets.read');return requireOperationApi(user,`widgets.drafts.${op}`);
}
export async function draftBody(request:Request){
 const reader=request.body?.getReader();if(!reader)throwApiError(400,'INVALID_DRAFT','Draft is required.');let length=0;const chunks:Uint8Array[]=[];
 try{while(true){const r=await reader.read();if(r.done)break;length+=r.value.length;if(length>524288){await reader.cancel();throwApiError(413,'DRAFT_TOO_LARGE','Draft exceeds 512 KiB.');}chunks.push(r.value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(length);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.length;}try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throwApiError(400,'INVALID_DRAFT','Invalid JSON.');}
}
export function draftId(id:string){const value=Number(id);if(!/^[1-9]\d*$/.test(id)||!Number.isSafeInteger(value))throwApiError(404,'NOT_FOUND','Draft not found.');return value;}
export function draftInput(body:unknown){
 const b=body as Record<string,unknown>|null,c=b?.content as Record<string,unknown>|undefined;
 if(!b||typeof b!=='object'||Array.isArray(b)||Object.keys(b).some(k=>!['widgetCode','version','content','revision'].includes(k))||typeof b.widgetCode!=='string'||! /^[a-z][a-z0-9_.-]{1,99}$/.test(b.widgetCode)||typeof b.version!=='string'||b.version.length>40||!/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(b.version)||!c||typeof c!=='object'||Array.isArray(c)||Object.keys(c).length!==4||!['metadata','html','css','javascript'].every(k=>typeof c[k]==='string'&&(c[k] as string).length<=131072))throwApiError(400,'INVALID_DRAFT','Invalid draft fields.');
 return {widgetCode:b.widgetCode,version:b.version,content:c as Prisma.InputJsonObject};
}
export async function saveDraft(actor:AuthenticatedUser,body:unknown,id?:number){
 const input=draftInput(body);const revision=(body as {revision?:unknown}).revision;if(id!==undefined&&(!Number.isSafeInteger(revision)||Number(revision)<1))throwApiError(400,'INVALID_REVISION','A positive revision is required.');
 try{return await getPrisma().$transaction(async tx=>{
  await tx.$queryRaw`SELECT id FROM employees WHERE id=${actor.id} AND deleted_at IS NULL FOR UPDATE`;
  if(id===undefined&&await tx.widgetDraft.count({where:{employeeId:actor.id,deletedAt:null}})>=100)throwApiError(422,'DRAFT_LIMIT','At most 100 drafts are allowed.');
  if(id!==undefined){const old=await tx.widgetDraft.findFirst({where:{id,employeeId:actor.id,deletedAt:null},select:{revision:true}});if(!old)throwApiError(404,'NOT_FOUND','Draft not found.');if(old.revision!==revision)throwApiError(409,'DRAFT_CONFLICT','Draft changed. Keep your edits and reload.');}
  const row=id===undefined?await tx.widgetDraft.create({data:{...input,employeeId:actor.id}}):await tx.widgetDraft.update({where:{id},data:{...input,revision:{increment:1}}});
  await writeAuditLog(tx,actor.id,id===undefined?'create_widget_draft':'update_widget_draft','widget_draft',row.id);return row;
 });}catch(error){if(error instanceof Prisma.PrismaClientKnownRequestError&&error.code==='P2002')throwApiError(409,'DRAFT_EXISTS','A draft with this widget ID and version already exists.');throw error;}
}
export async function removeDraft(actor:AuthenticatedUser,id:number,body:unknown){
 const revision=(body as {revision?:unknown}|null)?.revision;if(!Number.isSafeInteger(revision)||Number(revision)<1)throwApiError(400,'INVALID_REVISION','A positive revision is required.');
 return getPrisma().$transaction(async tx=>{await tx.$queryRaw`SELECT id FROM employees WHERE id=${actor.id} AND deleted_at IS NULL FOR UPDATE`;const old=await tx.widgetDraft.findFirst({where:{id,employeeId:actor.id,deletedAt:null},select:{id:true,revision:true}});if(!old)throwApiError(404,'NOT_FOUND','Draft not found.');if((await tx.widgetDraft.updateMany({where:{id,employeeId:actor.id,deletedAt:null,revision:Number(revision)},data:{deletedAt:new Date(),revision:{increment:1}}})).count!==1)throwApiError(409,'DRAFT_CONFLICT','Draft changed.');await writeAuditLog(tx,actor.id,'delete_widget_draft','widget_draft',id);return {id};});
}
