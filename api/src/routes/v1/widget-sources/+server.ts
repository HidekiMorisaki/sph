import { randomUUID } from 'node:crypto';
import { getPrisma } from '$lib/server/prisma';
import { admin } from '$lib/server/widgets/service';
import { publicUrl } from '$lib/server/widgets/public-json';
import { writeAuditLog } from '$lib/server/api/admin';
import { failure,success } from '$lib/server/api/response';
import { parseListQuery,listMeta } from '$lib/server/api/query';
export async function GET({locals,url}:import('./$types').RequestEvent) {
 admin(locals.user,'sources');const q=parseListQuery(url,['id','name'] as const,'id');
 const where={deletedAt:null};const [items,total]=await Promise.all([getPrisma().widgetSource.findMany({where,orderBy:[{[q.sortBy]:q.sortOrder},{id:'asc'}],take:q.limit,skip:q.offset}),getPrisma().widgetSource.count({where})]);
 return success(items,200,listMeta(q,items.length,total));
}
export async function POST({locals,request}:import('./$types').RequestEvent) {
 const actor=admin(locals.user,'sources'),b=await request.json().catch(()=>null);
 try {if(!b || typeof b.name!=='string' || !b.name.trim() || b.name.length>128 || typeof b.url!=='string') throw Error();publicUrl(b.url);} catch{return failure(400,'INVALID_SOURCE','Enter a name and a public HTTPS JSON URL.');}
 if(await getPrisma().widgetSource.findUnique({where:{url:b.url}})) return failure(409,'SOURCE_EXISTS','Source URL already registered.');
 const item=await getPrisma().$transaction(async tx=>{const source=await tx.widgetSource.create({data:{sourceKey:randomUUID(),name:b.name.trim(),url:b.url}});await writeAuditLog(tx,actor.id,'create_widget_source','widget_source',source.id);return source;});
 return success(item,201);
}
