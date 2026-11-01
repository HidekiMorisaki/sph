import {retiredOfficialRelease} from '$lib/server/widgets/retirement';
import {widgetUsageCounts,widgetGroupUsageCount} from '$lib/server/widgets/usage';
import {lockWidgetWrites,latestRelease} from '$lib/server/widgets/upgrades';
import {getPrisma} from '$lib/server/prisma';import {admin} from '$lib/server/widgets/service';import {writeAuditLog} from '$lib/server/api/admin';import {success,failure} from '$lib/server/api/response';
export async function PUT({locals,request,params}:import('./$types').RequestEvent){
 const actor=admin(locals.user,'approvals'),b=await request.json().catch(()=>null),id=Number(params.id);
 if(!Number.isSafeInteger(id)||id<1||typeof b?.allowed!=='boolean'||typeof b?.digest!=='string')return failure(400,'INVALID_APPROVAL','Approval requires the reviewed release digest.');
 if(b.confirmedUserCount!==undefined&&(!Number.isSafeInteger(b.confirmedUserCount)||b.confirmedUserCount<0))return failure(400,'INVALID_APPROVAL','Confirmed user count must be a non-negative integer.');
 if(b.grouped!==undefined&&typeof b.grouped!=='boolean')return failure(400,'INVALID_APPROVAL','Invalid approval scope.');
 return getPrisma().$transaction(async tx=>{
 await lockWidgetWrites(tx);
 await tx.$queryRaw`SELECT id FROM widget_releases WHERE id=${id} FOR UPDATE`;
 const r=await tx.widgetRelease.findFirst({where:{id,NOT:retiredOfficialRelease,deletedAt:null,source:{deletedAt:null}}});if(!r)return failure(404,'NOT_FOUND','Release not found.');if(r.digest!==b.digest)return failure(409,'REVIEW_CHANGED','Review the exact release digest.');
 const group=b.grouped?await tx.widgetRelease.findMany({where:{sourceId:r.sourceId,widgetCode:r.widgetCode,deletedAt:null}}):[r];
 if(b.grouped){
  const reviewed=Array.isArray(b.reviewedVersions)&&b.reviewedVersions.length===group.length&&group.every(release=>b.reviewedVersions.some((review:unknown)=>!!review&&typeof review==='object'&&'id' in review&&'digest' in review&&review.id===release.id&&review.digest===release.digest));
  if(latestRelease(group).id!==id||b.allowed&&!reviewed)return failure(409,'REVIEW_CHANGED','The version history changed. Reload and review it before allowing use.');
 }
 if(!b.allowed){
  const usageCount=b.grouped?await widgetGroupUsageCount(tx,group.map(r=>r.id)):(await widgetUsageCounts(tx,[id])).get(id)??0;
  if(usageCount>0&&(b.confirmedUserCount??0)<usageCount)return failure(409,'WIDGET_IN_USE','Users are using this widget. Confirm before stopping it.',[{field:'usageCount',reason:String(usageCount)}]);
 }
 for(const release of group){
  await tx.widgetApproval.upsert({where:{releaseId:release.id},create:{releaseId:release.id,allowed:b.allowed},update:{allowed:b.allowed,deletedAt:null}});
  await writeAuditLog(tx,actor.id,b.allowed?'allow_widget_release':'stop_widget_release','widget_release',release.id,{digest:release.digest,grouped:!!b.grouped});
 }
 return success(await tx.widgetApproval.findUnique({where:{releaseId:id}}));});
}
