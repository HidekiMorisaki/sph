import type { AuthenticatedUser } from '$lib/server/auth/types';
import { getPrisma } from '$lib/server/prisma';
import { fullDetails,occurrenceInclude } from './service';
export const scheduleNotificationTypes=['schedule.invitation','schedule.change','schedule.cancellation','schedule.response','schedule.resource-release'];
export async function resolveScheduleNotification(key:string,actor:AuthenticatedUser) {
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key))return {title:null,href:'/schedule?notice=unavailable',available:false};
 const item=await getPrisma().scheduleOccurrence.findFirst({where:{occurrenceKey:key,deletedAt:null,event:{deletedAt:null}},include:occurrenceInclude});
 if(!item||!fullDetails(item,actor))return {title:null,href:'/schedule?notice=unavailable',available:false};
 return {title:item.title,href:`/schedule?occurrence=${encodeURIComponent(key)}`,available:true};
}
