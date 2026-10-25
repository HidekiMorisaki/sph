import { requireOperationApi } from '$lib/server/api/admin';
import { success,throwApiError } from '$lib/server/api/response';
import { getPrisma } from '$lib/server/prisma';
import { allowedNotificationTypes } from '$lib/server/notifications';
export async function PUT({locals,request}:import('./$types').RequestEvent) {const actor=requireOperationApi(locals.user,'notifications.update');const b=await request.json().catch(()=>null);const through=new Date(b?.through);if(!Number.isFinite(through.getTime())||through>new Date()) throwApiError(422,'INVALID_TIME','Invalid time.');await getPrisma().notificationRecipient.updateMany({where:{employeeId:actor.id,readAt:null,createdAt:{lte:through},deletedAt:null,notification:{deletedAt:null,version:1,type:{in:allowedNotificationTypes(actor)}}},data:{readAt:new Date()}});return success({read:true});}
