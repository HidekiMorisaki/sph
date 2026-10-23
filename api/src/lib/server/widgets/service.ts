import {initializeRecords} from './records';
import {initialRecordsFor} from './storage-contract';
import bundled from '../../../../widgets/catalogue.json';
import { getPrisma } from '$lib/server/prisma';
import type { AuthenticatedUser } from '$lib/server/auth/types';
import { requireOperationApi, requireSystemAdminApi, writeAuditLog } from '$lib/server/api/admin';
import { throwApiError } from '$lib/server/api/response';
import { catalogue, manifest, digest, settings, type Manifest } from './contract';
import { publicJson } from './public-json';
import { widgetInformation } from './information';
import {retiredOfficialRelease,isRetiredOfficial} from './retirement';

export function admin(user: AuthenticatedUser | null, operation: 'sources' | 'approvals') {
 const actor = requireSystemAdminApi(user);
 return requireOperationApi(actor,`system.widgets.${operation}.update`);
}
export const personal = (user: AuthenticatedUser | null, write=false) => requireOperationApi(user, write ? 'widgets.layout.update' : 'widgets.read');
export async function refreshSource(sourceId: number, actor: AuthenticatedUser) {
 const source = await getPrisma().widgetSource.findFirst({where:{id:sourceId,deletedAt:null}});
 if (!source) throwApiError(404,'NOT_FOUND','Source not found.');
 let definitions: Manifest[];
 try { definitions=catalogue(source.sourceKey === 'sph-official' ? bundled : await publicJson(source.url)); }
 catch { throwApiError(422,'CATALOGUE_UNAVAILABLE','Unable to read a valid public catalogue.'); }
 return getPrisma().$transaction(async tx => {
  // Serialize refresh/removal of this source, including same-version hash checks.
  await tx.$queryRaw`SELECT id FROM widget_sources WHERE id=${source.id} AND deleted_at IS NULL FOR UPDATE`;
  if (!await tx.widgetSource.findFirst({where:{id:source.id,deletedAt:null}})) throwApiError(409,'SOURCE_CHANGED','Source changed.');
  for (const definition of definitions) {
   const existing=await tx.widgetRelease.findUnique({where:{sourceId_widgetCode_version:{sourceId,widgetCode:definition.id,version:definition.version}}});
   if(existing && existing.digest !== digest(definition)) throwApiError(409,'VERSION_HASH_CONFLICT','Publish changed definitions using a new version.');
   if(!existing) await tx.widgetRelease.create({data:{sourceId,widgetCode:definition.id,version:definition.version,definition,digest:digest(definition),approval:{create:{allowed:false}}}});
  }
  await writeAuditLog(tx,actor.id,'refresh_widget_source','widget_source',source.id,{releases:definitions.length});
  return {releases:definitions.length};
 });
}
export async function layout(actor: AuthenticatedUser) {
 const db=getPrisma();
 await db.$transaction(async tx => {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(4688,${actor.id})::text`;
  if(await tx.widgetLayout.findUnique({where:{employeeId:actor.id}})) return;
  await tx.widgetLayout.create({data:{employeeId:actor.id}});

 });
 const saved=await db.widgetLayout.findUniqueOrThrow({where:{employeeId:actor.id},include:{instances:{where:{deletedAt:null,release:{NOT:retiredOfficialRelease}},orderBy:[{sortOrder:'asc'},{id:'asc'}],include:{release:{include:{approval:true,source:true}}}}}});
 return {revision:saved.revision,instances:saved.instances.map(i=>({instanceKey:i.instanceKey,releaseId:i.releaseId,size:i.size,enabled:i.enabled,settings:i.settings,definition:i.release.definition,information:widgetInformation(i.release.definition as unknown as Manifest,i.release.source.sourceKey),allowed:!!i.release.approval?.allowed && !i.release.approval.deletedAt && !i.release.deletedAt && !i.release.source.deletedAt}))};
}
export async function updateLayout(actor: AuthenticatedUser, body: unknown) {
 if(!body || typeof body !== 'object') throwApiError(400,'INVALID_LAYOUT','Invalid layout.');
 const input=body as {revision?:unknown;instances?:unknown};
 if(!Number.isSafeInteger(input.revision) || !Array.isArray(input.instances) || input.instances.length>40) throwApiError(400,'INVALID_LAYOUT','Layout requires a revision and up to 40 instances.');
 const items=input.instances as Array<{instanceKey:string;releaseId:number;size:string;enabled:boolean;settings:unknown;initialRecords?:unknown}>;
 const seen=new Set<string>();
 for(const i of items) {
  if(!i || typeof i!=='object' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(i.instanceKey) || !Number.isSafeInteger(i.releaseId) || typeof i.enabled!=='boolean' || seen.has(i.instanceKey)) throwApiError(400,'INVALID_LAYOUT','Invalid or duplicate instance.');
  seen.add(i.instanceKey);
  if(i.initialRecords!==undefined){requireOperationApi(actor,'widgets.read');requireOperationApi(actor,'widgets.records.update');}
 }
 await getPrisma().$transaction(async tx=>{
  const l=await tx.widgetLayout.findUnique({where:{employeeId:actor.id}});
  if(!l || (await tx.widgetLayout.updateMany({where:{id:l.id,revision:input.revision as number,deletedAt:null},data:{revision:{increment:1}}})).count!==1) throwApiError(409,'LAYOUT_CONFLICT','Layout changed. Reload before saving your draft.');
  const existing=await tx.widgetInstance.findMany({where:{layoutId:l.id,deletedAt:null}});
  for(const [sortOrder,i] of items.entries()) {
   const old=existing.find(o=>o.instanceKey===i.instanceKey);
   if(old&&i.initialRecords!==undefined)throwApiError(400,'INVALID_INITIAL_RECORDS','Initial records are only accepted for new instances.');
   if(old && old.releaseId!==i.releaseId) throwApiError(400,'INVALID_LAYOUT','An instance release is immutable.');
   if(!old||i.initialRecords!==undefined)await tx.$queryRaw`SELECT r.id FROM widget_releases r JOIN widget_sources s ON s.id=r.source_id JOIN widget_approvals a ON a.release_id=r.id WHERE r.id=${i.releaseId} FOR SHARE OF r,s,a`;
   const r=await tx.widgetRelease.findUnique({where:{id:i.releaseId},include:{approval:true,source:true}});
   if(r && isRetiredOfficial(r.widgetCode,r.source.sourceKey)) throwApiError(410,'WIDGET_RETIRED','This official widget has been retired.');
   if(!r || !old && (r.deletedAt || r.source.deletedAt || !r.approval?.allowed || r.approval.deletedAt)) throwApiError(403,'WIDGET_NOT_APPROVED','Widget release is not approved.');
   let parsed: Record<string,string[]>;
   try {parsed=settings(manifest(r.definition),i.size,i.settings);} catch {throwApiError(400,'INVALID_SETTINGS','Invalid widget settings.');}
   if(old) await tx.widgetInstance.update({where:{id:old.id},data:{size:i.size,enabled:i.enabled,settings:parsed,sortOrder}});
   else {
    if(await tx.widgetInstance.findUnique({where:{instanceKey:i.instanceKey}})) throwApiError(400,'INVALID_INSTANCE','Instance identifier unavailable.');
    const definition=manifest(r.definition);
    if(i.initialRecords!==undefined&&!definition.storage?.operations.update)throwApiError(403,'STORAGE_OPERATION_DISABLED','Custom initial records require record editing.');
    let rows:ReturnType<typeof initialRecordsFor>;
    try{rows=initialRecordsFor(definition.storage,i.initialRecords);}catch{throwApiError(400,'INVALID_INITIAL_RECORDS','Initial records do not match the approved storage definition.');}
    const created=await tx.widgetInstance.create({data:{instanceKey:i.instanceKey,layoutId:l.id,releaseId:r.id,size:i.size,enabled:i.enabled,settings:parsed,sortOrder}});
    await initializeRecords(tx,created.id,definition.storage,rows);
    if(i.initialRecords!==undefined)await writeAuditLog(tx,actor.id,'initialize_widget_records','widget_instance',created.id,{recordKeys:rows.map(row=>row.recordKey)});
   }
  }
  const removed=existing.filter(i=>!seen.has(i.instanceKey)).map(i=>i.id);
  const removedAt=new Date();
  await tx.widgetRecord.updateMany({where:{instanceId:{in:removed},deletedAt:null},data:{deletedAt:removedAt,revision:{increment:1}}});
  await tx.widgetInstance.updateMany({where:{id:{in:removed},deletedAt:null},data:{deletedAt:removedAt}});
 });
 return layout(actor);
}
