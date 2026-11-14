import { requireOperationApi } from '#lib/server/api/admin.js';
import { success,throwApiError } from '#lib/server/api/response.js';
import { getPrisma } from '#lib/server/prisma.js';
import { allowedNotificationTypes } from '#lib/server/notifications/index.js';
export async function PUT({locals,params}:import('./$types').RequestEvent) {const actor=requireOperationApi(locals.user,'notifications.update');const id=Number(params.id);if(!Number.isSafeInteger(id)||id<1) throwApiError(404,'NOT_FOUND','Not found.');const changed=await getPrisma().notificationRecipient.updateMany({where:{id,employeeId:actor.id,deletedAt:null,notification:{deletedAt:null,version:1,type:{in:allowedNotificationTypes(actor)}}},data:{readAt:new Date()}});if(!changed.count) throwApiError(404,'NOT_FOUND','Not found.');return success({read:true});}
