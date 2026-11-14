import { requireOperationApi } from '#lib/server/api/admin.js';
import { success,throwApiError } from '#lib/server/api/response.js';
import { getPrisma } from '#lib/server/prisma.js';
import { allowedNotificationTypes } from '#lib/server/notifications/index.js';

export async function DELETE({locals,params}:import('./$types').RequestEvent) {
 const actor=requireOperationApi(locals.user,'notifications.delete');
 if(!/^[1-9]\d*$/.test(params.id))throwApiError(404,'NOT_FOUND','Not found.');
 const id=Number(params.id);
 if(!Number.isSafeInteger(id))throwApiError(404,'NOT_FOUND','Not found.');
 const changed=await getPrisma().notificationRecipient.updateMany({where:{id,employeeId:actor.id,deletedAt:null,notification:{deletedAt:null,version:1,type:{in:allowedNotificationTypes(actor)}}},data:{deletedAt:new Date()}});
 if(!changed.count)throwApiError(404,'NOT_FOUND','Not found.');
 return success({deleted:changed.count});
}
