import { Prisma } from '$lib/server/generated/prisma/client';
import type { AuthenticatedUser } from '$lib/server/auth/types';
import { getPrisma } from '$lib/server/prisma';
import { requireOperationApi, writeAuditLog } from './admin';
import { masterInput } from './employee-masters';
import { parseId } from './database';
import { listMeta, parseListQuery, parseSearch } from './query';
import { failure, success, throwApiError } from './response';
import { readMasterSnapshot, recordMasterChange } from './master-history';

type Event = {locals:{user:AuthenticatedUser|null};params:Record<string,string|undefined>;request:Request;url:URL};
function invalid(field: string): never {throwApiError(422,'VALIDATION_ERROR','One or more fields are invalid.',[{field,reason:'INVALID_VALUE'}]);}
function contact(body:Record<string,unknown>,field:string,max:number,required=false) {
 const value=body[field];if(value==null&&!required)return null;
 if(typeof value!=='string'||value.trim().length>max||(required&&!value.trim()))invalid(field);
 return value.trim()||null;
}

export async function clients({locals,params,request,url}:Event) {
 const method=request.method;
 const actor=requireOperationApi(locals.user,'clients.'+({GET:'read',POST:'create',PATCH:'update',DELETE:'delete'}[method]??'invalid'));
 requireOperationApi(actor,'clients.read');
 const id=params.id===undefined?null:parseId(params.id);
 if(params.id!==undefined&&!id)return failure(404,'NOT_FOUND','Not found.');
 const db=getPrisma();
 if(method==='GET'&&!id){
  const query=parseListQuery(url,['name','companyName','contactName','contactDepartment','contactEmail','contactMobile','createdAt','updatedAt'] as const,'name');
  const search=parseSearch(url),contains={contains:search,mode:'insensitive' as const};
  const where={deletedAt:null,OR:['name','companyName','contactName','contactDepartment','contactEmail','contactMobile','city','notes'].map(field=>({[field]:contains}))};
  return db.$transaction(async tx=>{
   const total=await tx.client.count({where});
   const items=await tx.client.findMany({where,orderBy:[{[query.sortBy]:query.sortOrder},{id:'asc'}],skip:query.offset,take:query.limit});
   return success(items,200,listMeta(query,items.length,total));
  },{isolationLevel:'RepeatableRead'});
 }
 if(method==='GET'){
  const item=await db.client.findFirst({where:{id:id!,deletedAt:null}});
  return item?success(item):failure(404,'NOT_FOUND','Not found.');
 }
 const body=method==='DELETE'?{}:await request.json().catch(()=>null);
 if(!body||typeof body!=='object'||Array.isArray(body))invalid('body');
 for(const field of ["openedOn", "closedOn", "managerEmployeeId", "deputyManagerEmployeeId", "sortOrder", "phoneNumber1Label", "phoneNumber2Label", "faxNumber1Label", "faxNumber2Label"])if(Object.hasOwn(body,field))invalid(field);
 const parsed=method==='DELETE'?null:masterInput('branches',body);
 const base=parsed?(({openedOn,closedOn,managerEmployeeId,deputyManagerEmployeeId,sortOrder,phoneNumber1Label,phoneNumber2Label,faxNumber1Label,faxNumber2Label,...retained})=>retained)(parsed):null;
 if(method!=='DELETE'&&!base)invalid('body');
 const data=base?{...base,companyName:contact(body,'companyName',128,true)!,contactName:contact(body,'contactName',128),contactDepartment:contact(body,'contactDepartment',128),contactEmail:contact(body,'contactEmail',254),contactMobile:contact(body,'contactMobile',32)}:null;
 if(data?.contactEmail&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.contactEmail))invalid('contactEmail');
 if(data?.contactMobile&&!/^[+0-9][0-9 ()-]{6,31}$/.test(data.contactMobile))invalid('contactMobile');
 try{return await db.$transaction(async tx=>{
  const before=id?await tx.client.findFirst({where:{id,deletedAt:null},select:{id:true}}):null;
  if(id&&!before)return failure(404,'NOT_FOUND','Not found.');
  const snapshot=id?await readMasterSnapshot(tx,'clients',id):null;
  if(method==='DELETE'){
   if(await tx.project.count({where:{clientId:id!,deletedAt:null}}))return failure(409,'RESOURCE_IN_USE','This client is used by an active project.');
   await tx.client.update({where:{id:id!},data:{deletedAt:new Date()}});
   await recordMasterChange(tx,'clients',id!,actor.id,'delete',snapshot,null);
   await writeAuditLog(tx,actor.id,'delete','clients',id!);
   return success({id,deleted:true});
  }
  const item=id?await tx.client.update({where:{id},data:data!}):await tx.client.create({data:data!});
  await recordMasterChange(tx,'clients',item.id,actor.id,id?'update':'create',snapshot,await readMasterSnapshot(tx,'clients',item.id));
  await writeAuditLog(tx,actor.id,id?'update':'create','clients',item.id);
  return success(item,id?200:201);
 },{isolationLevel:'Serializable'});}catch(error){
  if(error instanceof Prisma.PrismaClientKnownRequestError){
   if(error.code==='P2002')return failure(409,'DUPLICATE_VALUE','This value is already in use, including retained records.');
   if(error.code==='P2034')return failure(409,'CONCURRENT_CHANGE','Reload and try again.');
  }throw error;
 }
}
