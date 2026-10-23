import {listRecords,mutateRecord,readRecordBody} from '$lib/server/widgets/records';
import {parseListQuery,listMeta} from '$lib/server/api/query';
import {success} from '$lib/server/api/response';
export async function GET({locals,params,url,setHeaders}:import('./$types').RequestEvent){
 setHeaders({'cache-control':'no-store'});
 const q=parseListQuery(url,['recordKey','createdAt','updatedAt'] as const,'createdAt');
 const result=await listRecords(locals.user,params.key,q);return success(result.items,200,{...listMeta(q,result.items.length,result.total),operations:result.operations});
}
export async function POST({locals,params,request}:import('./$types').RequestEvent){return success(await mutateRecord(locals.user,params.key,'create',await readRecordBody(request)),201);}
