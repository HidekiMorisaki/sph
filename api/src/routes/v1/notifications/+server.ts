import { requireOperationApi } from '#lib/server/api/admin.js';
import { success,throwApiError } from '#lib/server/api/response.js';
import { parseListQuery,listMeta } from '#lib/server/api/query.js';
import { notifications,notificationCategories,type NotificationCategory } from '#lib/server/notifications/index.js';
import { allowedNotificationTypes } from '#lib/server/notifications/index.js';
import { getPrisma } from '#lib/server/prisma.js';
export async function GET({locals,url}:import('./$types').RequestEvent) {
 const actor=requireOperationApi(locals.user,'notifications.read'),q=parseListQuery(url,['createdAt'],'createdAt');
 if(q.sortOrder!=='desc'&&url.searchParams.has('sortOrder'))throwApiError(422,'INVALID_SORT_ORDER','Notifications use descending time order.');
 const category=url.searchParams.get('category')??'all',search=(url.searchParams.get('search')??'').trim();
 if(!notificationCategories.includes(category as NotificationCategory)||search.length>200||search.split(/\s+/).filter(Boolean).length>10)throwApiError(422,'INVALID_NOTIFICATION_FILTER','Select a valid category and search query.');
 const result=await notifications(actor,url.searchParams.get('unread')==='true',q.offset,q.limit,category as NotificationCategory,search);
 return success(result.items,200,{...listMeta({...q,sortOrder:'desc'},result.items.length,result.total),unreadCount:result.unreadCount,readCount:result.readCount,unreadCounts:result.unreadCounts,readThrough:new Date().toISOString()});
}
export async function DELETE({locals,url}:import('./$types').RequestEvent) {
 const actor=requireOperationApi(locals.user,'notifications.delete');
 const value=url.searchParams.get('through'),through=new Date(value??'');
 if(url.searchParams.get('read')!=='true'||!value||!Number.isFinite(through.getTime())||through>new Date())throwApiError(422,'INVALID_NOTIFICATION_FILTER','A read-only filter and valid cutoff are required.');
 const changed=await getPrisma().notificationRecipient.updateMany({where:{employeeId:actor.id,readAt:{lte:through},createdAt:{lte:through},deletedAt:null,notification:{deletedAt:null,version:1,type:{in:allowedNotificationTypes(actor)}}},data:{deletedAt:new Date()}});
 return success({deleted:changed.count});
}
