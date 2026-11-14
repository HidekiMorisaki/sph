import {retiredOfficialRelease} from '#lib/server/widgets/retirement.js';
import {getPrisma} from '#lib/server/prisma.js';
import {admin,personal} from '#lib/server/widgets/service.js';
import {parseListQuery,listMeta} from '#lib/server/api/query.js';
import {success} from '#lib/server/api/response.js';
import {hasPermissionOperation} from '#lib/server/auth/permissions.js';
import type {Manifest} from '#lib/server/widgets/contract.js';
import {widgetUsageCounts,widgetGroupUsageCount} from '#lib/server/widgets/usage.js';
import {releaseGroups,latestRelease,assessUpgrade,compareVersions} from '#lib/server/widgets/upgrades.js';
export async function GET({locals,url}:import('./$types').RequestEvent){
 const review=url.searchParams.get('review')==='true';const actor=review?admin(locals.user,'approvals'):personal(locals.user);
 const q=parseListQuery(url,['id','widgetCode','version'] as const,'id');
 if(!review||url.searchParams.get('grouped')==='true'){
  const result=await getPrisma().$transaction(async tx=>{
   const releases=await tx.widgetRelease.findMany({where:{NOT:retiredOfficialRelease,deletedAt:null,source:{deletedAt:null},...(!review?{approval:{allowed:true,deletedAt:null}}:{})},include:{approval:true,source:{select:{name:true,url:true}}}});
   const usage=review?await widgetUsageCounts(tx,releases.map(r=>r.id)):null;
   const groups=[];
   for(const versions of releaseGroups(releases)){
    const latest=latestRelease(versions);
    const assessment=review?await assessUpgrade(tx,versions,latest):null;
    groups.push({...latest,...(review?{usageCount:await widgetGroupUsageCount(tx,versions.map(v=>v.id)),updateReason:assessment?.instances.length||assessment?.reason?assessment?.reason??'UPDATE_REQUIRED':null,versions:versions.sort((a,b)=>compareVersions(b.version,a.version)).map(v=>({id:v.id,digest:v.digest,version:v.version,allowed:!!v.approval?.allowed&&!v.approval.deletedAt,usageCount:usage?.get(v.id)??0}))}:{}),canEditInitialRecords:!!latest.approval?.allowed&&!latest.approval.deletedAt&&hasPermissionOperation(actor,'widgets.read')&&hasPermissionOperation(actor,'widgets.records.update')&&(latest.definition as unknown as Manifest).storage?.operations.update===true});
   }
   groups.sort((a,b)=>{const x=a[q.sortBy],y=b[q.sortBy];return (x<y?-1:x>y?1:0)*(q.sortOrder==='asc'?1:-1)||a.id-b.id;});
   return {items:groups.slice(q.offset,q.offset+q.limit),total:groups.length};
  },{timeout:30000});
  return success(result.items,200,listMeta(q,result.items.length,result.total));
 }
 const where={NOT:retiredOfficialRelease,deletedAt:null,source:{deletedAt:null},...(!review?{approval:{allowed:true,deletedAt:null}}:{})};
 const [items,total]=await Promise.all([getPrisma().widgetRelease.findMany({where,include:{approval:true,source:{select:{name:true,url:true}}},orderBy:[{[q.sortBy]:q.sortOrder},{id:'asc'}],take:q.limit,skip:q.offset}),getPrisma().widgetRelease.count({where})]);
 const usage=review?await widgetUsageCounts(getPrisma(),items.map(item=>item.id)):null;
 return success(items.map(item=>({...item,...(usage?{usageCount:usage.get(item.id)??0}:{}),canEditInitialRecords:!!item.approval?.allowed&&!item.approval.deletedAt&&hasPermissionOperation(actor,'widgets.read')&&hasPermissionOperation(actor,'widgets.records.update')&&(item.definition as unknown as Manifest).storage?.operations.update===true})),200,listMeta(q,items.length,total));
}
