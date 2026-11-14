import { requireOperationApi } from '#lib/server/api/admin.js';
import { success,throwApiError } from '#lib/server/api/response.js';
import { getPrisma } from '#lib/server/prisma.js';
export async function GET({locals}:import('./$types').RequestEvent) {
 const actor=requireOperationApi(locals.user,'schedule.read');
 const row=await getPrisma().schedulePreference.findFirst({where:{employeeId:actor.id,deletedAt:null}});
 const settings=(row?.settings??{view:'week',mode:'overlay',firstDay:1,calendars:[{key:`employee:${actor.id}`,name:[actor.lastName,actor.firstName].join(' '),color:'#2563eb',visible:true}]}) as Record<string,unknown>;
 return success({revision:row?.revision??0,settings:{...settings,timeAxis:settings.timeAxis==='horizontal'?'horizontal':'vertical'}});
}
export async function PUT({locals,request}:import('./$types').RequestEvent) {
 const actor=requireOperationApi(locals.user,'schedule.preferences.update'),b=await request.json().catch(()=>null),s=b?.settings;
 if(s?.timeAxis!==undefined&&!['vertical','horizontal'].includes(s.timeAxis)) throwApiError(422,'INVALID_PREFERENCES','Invalid calendar preferences.');
 if(!s || !['day','week','month'].includes(s.view) || !['overlay','side'].includes(s.mode) || ![0,1].includes(s.firstDay) || !Array.isArray(s.calendars) || s.calendars.length>20 || new Set(s.calendars.map((c:{key:unknown})=>c.key)).size!==s.calendars.length || s.calendars.some((c:{key:unknown;name:unknown;color:unknown;visible:unknown})=>typeof c.key!=='string'||!/^(employee|resource):[1-9]\d*$/.test(c.key)||typeof c.name!=='string'||c.name.length>255||typeof c.color!=='string'||!/^#[0-9a-f]{6}$/i.test(c.color)||typeof c.visible!=='boolean') || !Number.isSafeInteger(b.expectedRevision)) throwApiError(422,'INVALID_PREFERENCES','Invalid calendar preferences.');
 const settings={view:s.view,mode:s.mode,firstDay:s.firstDay,timeAxis:s.timeAxis??'vertical',calendars:s.calendars.map((c:{key:string;name:string;color:string;visible:boolean})=>({key:c.key,name:c.name,color:c.color,visible:c.visible}))};
 const row=await getPrisma().$transaction(async tx=>{
  await tx.$queryRaw`SELECT id FROM employees WHERE id=${actor.id} FOR UPDATE`;
  const old=await tx.schedulePreference.findUnique({where:{employeeId:actor.id}});
  if((old?.revision??0)!==b.expectedRevision) throwApiError(409,'STALE_REVISION','Reload the calendar preferences.');
  return tx.schedulePreference.upsert({where:{employeeId:actor.id},create:{employeeId:actor.id,settings},update:{settings,revision:{increment:1},deletedAt:null}});
 });
 return success({revision:row.revision,settings:row.settings});
}
