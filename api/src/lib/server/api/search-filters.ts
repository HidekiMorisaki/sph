import { isHttpError } from '@sveltejs/kit';
import { Prisma } from '$lib/server/generated/prisma/client';
import { getPrisma } from '$lib/server/prisma';
import type { AuthenticatedUser } from '$lib/server/auth/types';
import { requireOperationApi, writeAuditLog } from './admin';
import { searchActor, validateSavedDefinition } from './search';
import { invalidSearch, searchBody } from './search-conditions';
import type { SearchTarget } from './search-registry';
import { listMeta, parseListQuery } from './query';
import { failure, success, throwApiError } from './response';

type Event={locals:{user:AuthenticatedUser|null};request:Request;url:URL;params:Record<string,string|undefined>};
const selection={id:true,target:true,name:true,definition:true,schemaVersion:true,revision:true,createdAt:true,updatedAt:true} as const;
function targetOf(value:unknown):SearchTarget {if(value!=='employees'&&value!=='books'&&value!=='assets')invalidSearch('target');return value;}
function filterName(value:unknown){if(typeof value!=='string'||!value.trim()||value.trim().length>100)invalidSearch('name');const name=value.trim();return {name};}
export async function savedFilters({locals,request,url,params}:Event) {
 const method=request.method;
 const operation='search_filters.'+({GET:'read',POST:'create',PATCH:'update',DELETE:'delete'}[method]??'invalid');
 const actor=requireOperationApi(locals.user,operation);
 const db=getPrisma();const rawId=params.id;
 const id=rawId===undefined?null:/^[1-9]\d*$/.test(rawId)&&Number.isSafeInteger(Number(rawId))?Number(rawId):0;
 if(id===0)return failure(404,'NOT_FOUND','Not found.');
 if(method==='GET'&&id===null){
  const target=targetOf(url.searchParams.get('target'));searchActor(actor,target);
  const query=parseListQuery(url,['name','createdAt','updatedAt'] as const,'name');const where={ownerEmployeeId:actor.id,target,deletedAt:null};
  const data=await db.$transaction(async tx=>({total:await tx.savedSearchFilter.count({where}),items:await tx.savedSearchFilter.findMany({where,select:selection,orderBy:[{[query.sortBy]:query.sortOrder},{id:'asc'}],skip:query.offset,take:query.limit})}),{isolationLevel:'RepeatableRead'});
  const response=success(data.items,200,listMeta(query,data.items.length,data.total));response.headers.set('Cache-Control','no-store');return response;
 }
 const existing=id===null?null:await db.savedSearchFilter.findFirst({where:{id,ownerEmployeeId:actor.id,deletedAt:null},select:selection});
 if(id!==null&&!existing)return failure(404,'NOT_FOUND','Not found.');
 if(method==='GET'){
  searchActor(actor,existing!.target as SearchTarget);
  await validateSavedDefinition(existing!.definition,existing!.target as SearchTarget,{...actor,activeOperation:undefined});
  const response=success(existing);response.headers.set('Cache-Control','no-store');return response;
 }
 const body=method==='DELETE'?{}:await searchBody(request);
 const allowed=method==='POST'?['target','name','definition']:['name','definition','revision'];
 if(Object.keys(body).some(key=>!allowed.includes(key)))invalidSearch();
 const target=existing?existing.target as SearchTarget:targetOf(body.target);searchActor(actor,target);
 if(method==='PATCH'&&(!Number.isSafeInteger(body.revision)||body.revision!==existing!.revision))return failure(409,'FILTER_REVISION_CONFLICT','The filter has changed. Reload and retry.');
 if(method==='PATCH'&&body.name===undefined&&body.definition===undefined)invalidSearch();
 const name=method==='DELETE'?null:filterName(body.name??existing?.name);
 const definition=method==='DELETE'?null:await validateSavedDefinition(body.definition??existing?.definition,target,{...actor,activeOperation:undefined});
 try{
  return await db.$transaction(async tx=>{
   // An owner row serializes the 32-filter limit, concurrent updates, and employee deletion.
   const owners=await tx.$queryRaw<Array<{id:number}>>`SELECT id FROM employees WHERE id=${actor.id} AND deleted_at IS NULL FOR UPDATE`;
   if(!owners.length)throwApiError(403,'PERMISSION_REQUIRED','Permission is required.');
   const current=id===null?null:await tx.savedSearchFilter.findFirst({where:{id,ownerEmployeeId:actor.id,deletedAt:null},select:selection});
   if(id!==null&&!current)return failure(404,'NOT_FOUND','Not found.');
   if(method==='DELETE'){
    await tx.savedSearchFilter.update({where:{id:id!},data:{deletedAt:new Date(),revision:{increment:1}}});await writeAuditLog(tx,actor.id,'delete','saved_search_filter',id!);return success({id,deleted:true});
   }
   if(current&&current.revision!==body.revision)return failure(409,'FILTER_REVISION_CONFLICT','The filter has changed. Reload and retry.');
   if(id===null&&await tx.savedSearchFilter.count({where:{ownerEmployeeId:actor.id,target,deletedAt:null}})>=32)return failure(409,'FILTER_LIMIT_REACHED','At most 32 active filters are allowed per page.');
   const data={...name!,definition:definition! as unknown as Prisma.InputJsonValue,schemaVersion:1,deletedAt:null};
   const item=current?await tx.savedSearchFilter.update({where:{id:current.id},data:{...data,revision:{increment:1}},select:selection}):await tx.savedSearchFilter.create({data:{...data,ownerEmployeeId:actor.id,target},select:selection});
   await writeAuditLog(tx,actor.id,current?'update':'create','saved_search_filter',item.id);return success(item,current?200:201);
  });
 }catch(error){if(isHttpError(error))throw error;if(error instanceof Prisma.PrismaClientKnownRequestError&&['P2002','P2034'].includes(error.code))return failure(409,'FILTER_CONFLICT','The filter has changed. Reload and retry.');throw error;}
}
