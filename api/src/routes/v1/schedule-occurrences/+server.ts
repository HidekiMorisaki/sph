import { calendarQuery } from '$lib/server/schedule/query';
import { requireOperationApi } from '$lib/server/api/admin';
import { success,throwApiError } from '$lib/server/api/response';
import { parseListQuery,listMeta } from '$lib/server/api/query';
import { getPrisma } from '$lib/server/prisma';
import { occurrenceInclude,present } from '$lib/server/schedule/service';

export async function GET({locals,url}:import('./$types').RequestEvent) {
 const actor=requireOperationApi(locals.user,'schedule.read'),q=parseListQuery(url,['startsAt'],'startsAt'),f=calendarQuery(url,actor.id,actor.timeZone);
 const where={deletedAt:null,canceledAt:null,event:{deletedAt:null},OR:[{startsAt:{lt:f.end},endsAt:{gt:f.start},OR:[{event:{organizerId:{in:f.employees},deletedAt:null}},{participants:{some:{employeeId:{in:f.employees},deletedAt:null}}}]},{reservations:{some:{resourceId:{in:f.resources},deletedAt:null,releasedAt:null,startsAt:{lt:f.end},endsAt:{gt:f.start}}}}]};
 const db=getPrisma(),[items,total]=await Promise.all([db.scheduleOccurrence.findMany({where,include:occurrenceInclude,skip:q.offset,take:q.limit,orderBy:[{startsAt:q.sortOrder},{id:q.sortOrder}]}),db.scheduleOccurrence.count({where})]);
 return success(items.map(i=>({...present(i,actor),calendarKeys:f.calendars.filter(c=>{const id=Number(c.split(':')[1]);return c.startsWith('employee:')?i.event.organizerId===id||i.participants.some(p=>p.employeeId===id):i.reservations.some(r=>r.resourceId===id);})})),200,listMeta(q,items.length,total));
}
