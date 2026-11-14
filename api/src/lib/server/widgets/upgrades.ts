import type {Prisma} from '#lib/server/generated/prisma/client.js';
import {manifest, settings, canonical, type Manifest} from './contract';
import {valuesFor, byteSize} from './storage-contract';

type Tx = Prisma.TransactionClient;
export type Release = Prisma.WidgetReleaseGetPayload<{include:{approval:true}}>;
export const allowed = (release:Release) => !!release.approval?.allowed && !release.approval.deletedAt;

// All widget writes take this lock before row locks. Fetch remote catalogues first.
// This also protects records and placements created while an upgrade is assessed.
export async function lockWidgetWrites(tx:Tx) {
 await tx.$queryRaw`SELECT pg_advisory_xact_lock(4689,1)::text`;
}

export function compareVersions(a:string,b:string):number {
 const split=(value:string)=>{const index=value.indexOf('-');return index<0?[value,undefined] as const:[value.slice(0,index),value.slice(index+1)] as const;};
 const [left,preA]=split(a),[right,preB]=split(b);
 const aa=left.split('.'),bb=right.split('.');
 const number=(x:string,y:string)=>{x=x.replace(/^0+(?=\d)/,'');y=y.replace(/^0+(?=\d)/,'');return x.length-y.length || (x<y?-1:x>y?1:0);};
 for(let i=0;i<3;i++){const order=number(aa[i],bb[i]);if(order)return order;}
 if(preA===preB)return 0;if(preA===undefined)return 1;if(preB===undefined)return -1;
 const x=preA.split('.'),y=preB.split('.');
 for(let i=0;i<Math.max(x.length,y.length);i++){
  if(x[i]===y[i])continue;if(x[i]===undefined)return -1;if(y[i]===undefined)return 1;
  const nx=/^\d+$/.test(x[i]),ny=/^\d+$/.test(y[i]);
  if(nx&&ny)return number(x[i],y[i]);if(nx!==ny)return nx?-1:1;
  return x[i]<y[i]?-1:1;
 }
 return 0;
}
export function latestRelease<T extends {version:string}>(releases:T[]):T {
 const stable=releases.filter(r=>!r.version.includes('-'));
 return [...(stable.length?stable:releases)].sort((a,b)=>compareVersions(b.version,a.version))[0];
}
export function releaseGroups<T extends {sourceId:number;widgetCode:string}>(releases:T[]):T[][] {
 const groups=new Map<string,T[]>();
 for(const release of releases){const key=`${release.sourceId}:${release.widgetCode}`;groups.set(key,[...(groups.get(key)??[]),release]);}
 return [...groups.values()];
}

function compatible(old:Manifest,next:Manifest):boolean {
 // Runtime changes are allowed, but changing the rendering/storage contract or
 // granting new data access requires a separately designed migration/review.
 const structure=(d:Manifest)=>({schemaVersion:d.schemaVersion,runtime:!!d.runtime,capabilities:[...d.capabilities].sort(),
  storage:d.storage?{fields:Object.fromEntries(Object.entries(d.storage.fields).map(([key,{label:_,...field}])=>[key,field])),operations:d.storage.operations}:null,
  configuration:d.configuration?{fields:Object.fromEntries(Object.entries(d.configuration.fields).map(([key,{label:_,...field}])=>[key,field]))}:null});
 return canonical(structure(old))===canonical(structure(next));
}

export type UpdateReason = 'APPROVAL_CONFLICT'|'INCOMPATIBLE_DEFINITION'|'INCOMPATIBLE_SETTINGS'|'INCOMPATIBLE_RECORDS'|'RELEASE_UNAVAILABLE'|'NEWER_VERSION_IN_USE';
export async function assessUpgrade(tx:Tx,releases:Release[],target:Release,newReleaseIds:number[]=[]){
 const ids=releases.map(r=>r.id);
 const instances=await tx.widgetInstance.findMany({where:{releaseId:{in:ids},deletedAt:null},include:{records:{where:{deletedAt:null}}}});
 const older=instances.filter(i=>i.releaseId!==target.id);
 const prior=releases.filter(r=>r.id!==target.id&&compareVersions(r.version,target.version)<0);
 // A freshly fetched, unreviewed release is not a deliberate stop. Explicit
 // decisions on an already fetched release are authoritative even without users.
 const explicit=!newReleaseIds.includes(target.id)&&await tx.auditLog.findFirst({where:{resource:'widget_release',resourceId:target.id,action:{in:['allow_widget_release','stop_widget_release']},deletedAt:null},select:{id:true}});
 let references=releases.filter(r=>instances.some(i=>i.releaseId===r.id));
 if(!references.length)references=prior.length?[latestRelease(prior)]:[target];
 if((explicit||allowed(target))&&!references.some(r=>r.id===target.id))references.push(target);
 const states=new Set(references.map(allowed));
 const desired=allowed(references[0]);
 let reason:UpdateReason|undefined=states.size>1?'APPROVAL_CONFLICT':undefined;
 const next=manifest(target.definition);
 if(!reason&&older.some(i=>compareVersions(releases.find(r=>r.id===i.releaseId)!.version,target.version)>0))reason='NEWER_VERSION_IN_USE';
 // Approval inheritance also needs a compatible contract when nobody has yet
 // placed the widget; a newly requested capability must never gain approval.
 if(!reason&&references.some(r=>r.id!==target.id&&!compatible(manifest(r.definition),next)))reason='INCOMPATIBLE_DEFINITION';
 for(const instance of older){
  const source=releases.find(r=>r.id===instance.releaseId)!;
  if(reason)break;
  if(source.deletedAt||target.deletedAt){reason='RELEASE_UNAVAILABLE';break;}
  if(!compatible(manifest(source.definition),next)){reason='INCOMPATIBLE_DEFINITION';break;}
  try{
   if(canonical(settings(next,instance.size,instance.settings))!==canonical(instance.settings))throw Error();
   const old=manifest(source.definition);
   if(canonical(old.sizeLayouts[instance.size])!==canonical(next.sizeLayouts[instance.size]))throw Error();
  }catch{reason='INCOMPATIBLE_SETTINGS';break;}
  try{
   if(instance.records.length&&!next.storage)throw Error();
   if(next.storage){
    if(instance.records.length>(next.storage.maxRecords??1000))throw Error();
    let bytes=0;
    for(const row of instance.records){const values=valuesFor(next.storage,row.values);if(canonical(values)!==canonical(row.values))throw Error();bytes+=byteSize(values);}
    if(bytes>(next.storage.maxTotalBytes??1048576))throw Error();
   }
  }catch{reason='INCOMPATIBLE_RECORDS';}
 }
 return {reason,desired,instances:older};
}
