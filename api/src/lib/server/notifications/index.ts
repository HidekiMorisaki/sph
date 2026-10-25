import type { AuthenticatedUser } from '$lib/server/auth/types';
import { getPrisma } from '$lib/server/prisma';
import { resolveScheduleNotification,scheduleNotificationTypes } from '$lib/server/schedule/notification-resolver';
// Register a domain's authorization, known types and typed internal target here.
// The producer never stores HTML, arbitrary URLs or private message snapshots.
const resolvers={
 'schedule-occurrence':{types:scheduleNotificationTypes,canRead:(actor:AuthenticatedUser)=>actor.permissionOperations.includes('schedule.read'),resolve:resolveScheduleNotification}
};
export function allowedNotificationTypes(actor:AuthenticatedUser) {return Object.values(resolvers).flatMap(r=>r.canRead(actor)?r.types:[]);}
export async function notifications(actor:AuthenticatedUser,unread:boolean,offset:number,limit:number) {
 const base={employeeId:actor.id,deletedAt:null,notification:{deletedAt:null,version:1,type:{in:allowedNotificationTypes(actor)}}};
 const where={...base,...(unread?{readAt:null}:{})};
 const db=getPrisma();
 const [rows,total,unreadCount]=await Promise.all([db.notificationRecipient.findMany({where,include:{notification:true},orderBy:[{createdAt:'desc'},{id:'desc'}],skip:offset,take:limit}),db.notificationRecipient.count({where:base}),db.notificationRecipient.count({where:{...base,readAt:null}})]);
 const items=await Promise.all(rows.map(async row=>{
  const n=row.notification,resolver=resolvers[n.targetType as keyof typeof resolvers];
  const target=resolver&&resolver.canRead(actor)&&resolver.types.includes(n.type)?await resolver.resolve(n.targetKey,actor):{title:null,href:null,available:false};
  return {id:row.id,key:n.notificationKey,type:n.type,createdAt:n.createdAt,readAt:row.readAt,...target};
 }));
 return {items,total:unread?unreadCount:total,unreadCount,readCount:Math.max(0,total-unreadCount)};
}
