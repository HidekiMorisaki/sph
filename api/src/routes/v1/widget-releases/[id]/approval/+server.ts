import {retiredOfficialRelease} from '$lib/server/widgets/retirement';
import {widgetUsageCounts} from '$lib/server/widgets/usage';
import {getPrisma} from '$lib/server/prisma';import {admin} from '$lib/server/widgets/service';import {writeAuditLog} from '$lib/server/api/admin';import {success,failure} from '$lib/server/api/response';
export async function PUT({locals,request,params}:import('./$types').RequestEvent){
 const actor=admin(locals.user,'approvals'),b=await request.json().catch(()=>null),id=Number(params.id);
 if(!Number.isSafeInteger(id)||id<1||typeof b?.allowed!=='boolean'||typeof b?.digest!=='string')return failure(400,'INVALID_APPROVAL','Approval requires the reviewed release digest.');
 if(b.confirmedUserCount!==undefined&&(!Number.isSafeInteger(b.confirmedUserCount)||b.confirmedUserCount<0))return failure(400,'INVALID_APPROVAL','Confirmed user count must be a non-negative integer.');
 return getPrisma().$transaction(async tx=>{
 await tx.$queryRaw`SELECT id FROM widget_releases WHERE id=${id} FOR UPDATE`;
 const r=await tx.widgetRelease.findFirst({where:{id,NOT:retiredOfficialRelease,deletedAt:null,source:{deletedAt:null}}});if(!r)return failure(404,'NOT_FOUND','Release not found.');if(r.digest!==b.digest)return failure(409,'REVIEW_CHANGED','Review the exact release digest.');
 if(!b.allowed){
  const usageCount=(await widgetUsageCounts(tx,[id])).get(id)??0;
  if(usageCount>0&&(b.confirmedUserCount??0)<usageCount)return failure(409,'WIDGET_IN_USE','Users are using this widget. Confirm before stopping it.',[{field:'usageCount',reason:String(usageCount)}]);
 }
 const item=await tx.widgetApproval.upsert({where:{releaseId:id},create:{releaseId:id,allowed:b.allowed},update:{allowed:b.allowed,deletedAt:null}});await writeAuditLog(tx,actor.id,b.allowed?'allow_widget_release':'stop_widget_release','widget_release',id,{digest:r.digest});return success(item);});
}
