import {retiredOfficialRelease} from '$lib/server/widgets/retirement';
import {getPrisma} from '$lib/server/prisma';
import {admin,personal} from '$lib/server/widgets/service';
import {parseListQuery,listMeta} from '$lib/server/api/query';
import {success} from '$lib/server/api/response';
import {hasPermissionOperation} from '$lib/server/auth/permissions';
import type {Manifest} from '$lib/server/widgets/contract';
import {widgetUsageCounts} from '$lib/server/widgets/usage';
export async function GET({locals,url}:import('./$types').RequestEvent){
 const review=url.searchParams.get('review')==='true';const actor=review?admin(locals.user,'approvals'):personal(locals.user);
 const q=parseListQuery(url,['id','widgetCode','version'] as const,'id');
 const where={NOT:retiredOfficialRelease,deletedAt:null,source:{deletedAt:null},...(!review?{approval:{allowed:true,deletedAt:null}}:{})};
 const [items,total]=await Promise.all([getPrisma().widgetRelease.findMany({where,include:{approval:true,source:{select:{name:true,url:true}}},orderBy:[{[q.sortBy]:q.sortOrder},{id:'asc'}],take:q.limit,skip:q.offset}),getPrisma().widgetRelease.count({where})]);
 const usage=review?await widgetUsageCounts(getPrisma(),items.map(item=>item.id)):null;
 return success(items.map(item=>({...item,...(usage?{usageCount:usage.get(item.id)??0}:{}),canEditInitialRecords:!!item.approval?.allowed&&!item.approval.deletedAt&&hasPermissionOperation(actor,'widgets.read')&&hasPermissionOperation(actor,'widgets.records.update')&&(item.definition as unknown as Manifest).storage?.operations.update===true})),200,listMeta(q,items.length,total));
}
