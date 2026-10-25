import { requireOperationApi } from '$lib/server/api/admin';
import { success } from '$lib/server/api/response';
import { getPrisma } from '$lib/server/prisma';
import { calendarQuery } from '$lib/server/schedule/query';
export async function GET({locals,url}:import('./$types').RequestEvent) {
 const actor=requireOperationApi(locals.user,'schedule.read'),q=calendarQuery(url,actor.id,actor.timeZone),db=getPrisma();
 const start=new Date(q.start.getTime()-86400000),end=new Date(q.end.getTime()+86400000);
 const employees=await db.employee.findMany({where:{id:{in:q.employees},deletedAt:null},select:{id:true,countryCode:true,workCalendar:{select:{deletedAt:true,countryCode:true,entries:{where:{deletedAt:null,workDate:{gte:start,lt:end}},select:{workDate:true,entryType:true,title:true}}}}}});
 const resources=await db.reservableResource.findMany({where:{id:{in:q.resources},deletedAt:null,room:{deletedAt:null}},select:{id:true,room:{select:{branch:{select:{countryCode:true}}}}}});
 const calendars=[...employees.map(e=>({key:`employee:${e.id}`,countryCode:e.workCalendar&&!e.workCalendar.deletedAt?e.workCalendar.countryCode:e.countryCode})),...resources.map(r=>({key:`resource:${r.id}`,countryCode:r.room!.branch.countryCode}))];
 const holidays=await db.calendarDateAttribute.findMany({where:{countryCode:{in:[...new Set(calendars.map(c=>c.countryCode))]},calendarDate:{gte:start,lt:end},deletedAt:null},select:{countryCode:true,calendarDate:true,kind:true,name:true}});
 const days=employees.flatMap(e=>!e.workCalendar||e.workCalendar.deletedAt?[]:e.workCalendar.entries.map(d=>({calendarKey:`employee:${e.id}`,date:d.workDate.toISOString().slice(0,10),kind:d.entryType,title:d.title})));
 for(const h of holidays) for(const c of calendars.filter(c=>c.countryCode===h.countryCode))days.push({calendarKey:c.key,date:h.calendarDate.toISOString().slice(0,10),kind:h.kind,title:h.name});
 return success({days});
}
