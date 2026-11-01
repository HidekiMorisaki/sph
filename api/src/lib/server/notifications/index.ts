import {Prisma} from '$lib/server/generated/prisma/client';
import {notificationSearch} from './search';
import type { AuthenticatedUser } from '$lib/server/auth/types';
import { getPrisma } from '$lib/server/prisma';
import { resolveScheduleNotification,scheduleNotificationTypes } from '$lib/server/schedule/notification-resolver';
// Register a domain's authorization, known types and typed internal target here.
// The producer never stores HTML, arbitrary URLs or private message snapshots.
import {resolveWorkflowNotification,workflowTypes} from '$lib/server/workflow/service';
import {resolveProjectNotification,projectNotificationTypes} from '$lib/server/projects/service';
const resolvers={
 'project-ticket':{types:projectNotificationTypes,canRead:(actor:AuthenticatedUser)=>actor.permissionOperations.includes('projects.read'),resolve:resolveProjectNotification},
 'workflow-action':{types:workflowTypes,canRead:(actor:AuthenticatedUser)=>actor.permissionOperations.includes('workflows.read'),resolve:resolveWorkflowNotification},
 'schedule-occurrence':{types:scheduleNotificationTypes,canRead:(actor:AuthenticatedUser)=>actor.permissionOperations.includes('schedule.read'),resolve:resolveScheduleNotification}
};
export function allowedNotificationTypes(actor:AuthenticatedUser) {return Object.values(resolvers).flatMap(r=>r.canRead(actor)?r.types:[]);}
export const notificationCategories=['all','workflows','projects','information'] as const;
export type NotificationCategory=typeof notificationCategories[number];
const categoryOf=(type:string):Exclude<NotificationCategory,'all'>=>type.startsWith('workflow.')?'workflows':type.startsWith('project.')?'projects':'information';
export async function notifications(actor:AuthenticatedUser,unread:boolean,offset:number,limit:number,category:NotificationCategory='all',query='') {
 const types=allowedNotificationTypes(actor);
 if(!types.length)return {items:[],total:0,unreadCount:0,readCount:0,unreadCounts:{all:0,unread:0,workflows:0,projects:0,information:0}};
 const base=Prisma.sql`recipient.employee_id=${actor.id} AND recipient.deleted_at IS NULL AND n.deleted_at IS NULL AND n.version=1 AND n.type IN (${Prisma.join(types)})`;
 const search=notificationSearch(actor,query);
 const categoryTypes=types.filter(type=>category==='all'||categoryOf(type)===category);
 const selected=Prisma.sql`${base} AND ${search} AND ${categoryTypes.length?Prisma.sql`n.type IN (${Prisma.join(categoryTypes)})`:Prisma.sql`false`} AND ${unread?Prisma.sql`recipient.read_at IS NULL`:Prisma.sql`true`}`;
 const from=Prisma.sql`notification_recipients recipient JOIN notification_events n ON n.id=recipient.notification_id`;
 type Count={type:string;total:bigint;unread:bigint};
 const snapshot=await getPrisma().$transaction(async tx=>{
  const counts=await tx.$queryRaw<Count[]>(Prisma.sql`SELECT n.type,count(*) AS total,count(*) FILTER(WHERE recipient.read_at IS NULL) AS unread FROM ${from} WHERE ${base} GROUP BY n.type`);
  const matching=query?await tx.$queryRaw<Count[]>(Prisma.sql`SELECT n.type,count(*) AS total,count(*) FILTER(WHERE recipient.read_at IS NULL) AS unread FROM ${from} WHERE ${base} AND ${search} GROUP BY n.type`):counts;
  const ids=await tx.$queryRaw<{id:number}[]>(Prisma.sql`SELECT recipient.id FROM ${from} WHERE ${selected} ORDER BY recipient.created_at DESC,recipient.id DESC OFFSET ${offset} LIMIT ${limit}`);
  const rows=await tx.notificationRecipient.findMany({where:{id:{in:ids.map(r=>r.id)},employeeId:actor.id,deletedAt:null},include:{notification:true}});
  return {counts,matching,rows:ids.map(r=>rows.find(row=>row.id===r.id)!)};
 },{isolationLevel:'RepeatableRead'});
 const items=await Promise.all(snapshot.rows.map(async row=>{
  const n=row.notification,resolver=resolvers[n.targetType as keyof typeof resolvers];
  const target=resolver&&resolver.canRead(actor)&&resolver.types.includes(n.type)?await resolver.resolve(n.targetKey,actor):{title:null,href:null,available:false};
  return {id:row.id,key:n.notificationKey,type:n.type,createdAt:n.createdAt,readAt:row.readAt,...target};
 }));
 const sum=(rows:Count[],field:'total'|'unread')=>rows.reduce((n,row)=>n+Number(row[field]),0);
 const total=sum(snapshot.counts,'total'),unreadCount=sum(snapshot.counts,'unread');
 const matchingCategory=snapshot.matching.filter(row=>category==='all'||categoryOf(row.type)===category);
 const matchingUnread=sum(snapshot.matching,'unread');
 return {items,total:sum(matchingCategory,unread?'unread':'total'),unreadCount,readCount:Math.max(0,total-unreadCount),unreadCounts:{all:matchingUnread,unread:matchingUnread,workflows:sum(snapshot.matching.filter(row=>categoryOf(row.type)==='workflows'),'unread'),projects:sum(snapshot.matching.filter(row=>categoryOf(row.type)==='projects'),'unread'),information:sum(snapshot.matching.filter(row=>categoryOf(row.type)==='information'),'unread')}};
}
