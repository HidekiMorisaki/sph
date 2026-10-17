import type { AuthenticatedUser } from '$lib/server/auth/types';
import { requireScopedOperationApi } from './branch-access';
import { employeeList } from './employee-list';
import { bookList } from './book-list';
import { compileSearchConditions, definitionUrl, invalidSearch, parseSearchDefinition, searchBody, type SearchDefinition } from './search-conditions';
import { searchFieldDefinitions, contextsFor, operationScope, type SearchTarget } from './search-registry';
import { Prisma } from '$lib/server/generated/prisma/client';
import { getPrisma } from '$lib/server/prisma';
import { requireOperationApi } from './admin';
import type { SearchNode } from './search-conditions';
import { success } from './response';

export function searchActor(user:AuthenticatedUser|null,target:SearchTarget) {
 if(target==='books')return requireOperationApi(user,'books.read');
 return requireScopedOperationApi(user?{...user,activeOperation:undefined}:null,target==='employees'?'employees.read':'books.read').actor;
}
export async function searchResults(user:AuthenticatedUser|null,target:SearchTarget,request:Request,url:URL) {
 const actor=searchActor(user,target);const body=await searchBody(request);
 if(Object.keys(body).some(key=>!['definition','offset','includeColumns','visibleSearch','searchLocale'].includes(key)))invalidSearch();
 const definition=parseSearchDefinition(body.definition,target,actor);
 await validateSearchReferences(definition,target,actor);
 if(body.offset!==undefined&&(typeof body.offset!=='number'||!Number.isSafeInteger(body.offset)||body.offset<0))invalidSearch('offset');
 if(body.includeColumns!==undefined&&typeof body.includeColumns!=='boolean')invalidSearch('includeColumns');
 const resultUrl=definitionUrl(definition,url,body.offset as number??0,body.includeColumns===true);
 if(target==='employees'){
  resultUrl.searchParams.set('includeAvatar','true');
  if(body.visibleSearch!==undefined){if(typeof body.visibleSearch!=='string'||body.visibleSearch.length>500)invalidSearch('visibleSearch');resultUrl.searchParams.set('visibleSearch',body.visibleSearch);}
  if(body.searchLocale!==undefined){if(!['ja','en'].includes(String(body.searchLocale)))invalidSearch('searchLocale');resultUrl.searchParams.set('searchLocale',String(body.searchLocale));}
 }
 const sql=compileSearchConditions(definition,target,actor);
 const response=await (target==='employees'?employeeList(actor,resultUrl,sql):bookList(actor,resultUrl,sql));
 response.headers.set('Cache-Control','no-store');return response;
}
export async function searchFields(user:AuthenticatedUser|null,target:SearchTarget) {
 const actor=searchActor(user,target);
 const data=searchFieldDefinitions(target,actor);
 const result=[];
 for(const context of data){
  const fields=[];
  for(const field of context.fields){
   const source=contextsFor(target).find(ctx=>ctx.code===context.code)!.fields.find(f=>f.code===field.code)!;
   const options=source.reference?await referenceOptions(context.code,source.reference,actor,target):undefined;
   fields.push({...field,...(options?{options}: {})});
  }
  result.push({...context,fields});
 }
 const response=success(result,200,{schemaVersion:1,limits:{depth:3,conditions:50,selections:100,bodyBytes:65536},filterOperations:['read','create','update','delete'].filter(action=>actor.permissionOperations.includes('search_filters.'+action))});
 response.headers.set('Cache-Control','no-store');return response;
}
export async function validateSavedDefinition(definition:unknown,target:SearchTarget,user:AuthenticatedUser):Promise<SearchDefinition> {
 const parsed=parseSearchDefinition(definition,target,user);
 await validateSearchReferences(parsed,target,user);
 // Reuse actual list validation, including option permissions and sort allowlists.
 const url=definitionUrl({...parsed,limit:1},new URL('http://search.invalid'));
 await (target==='employees'?employeeList(user,url,compileSearchConditions(parsed,target,user)):bookList(user,url,compileSearchConditions(parsed,target,user)));
 return parsed;
}

async function referenceOptions(contextCode:string,reference:{table:string;key:string;name:string},user:AuthenticatedUser,target:SearchTarget) {
 const scope=operationScope(user,target==='employees'?'employees.read':'books.read');
 const branch=reference.table==='branches'&&scope!==null?Prisma.sql`AND id=${scope}`:Prisma.empty;
 return getPrisma().$queryRaw<Array<{value:string;label:string}>>(Prisma.sql`SELECT ${Prisma.raw(reference.key)}::text AS value,${Prisma.raw(reference.name)} AS label FROM ${Prisma.raw(reference.table)} WHERE deleted_at IS NULL ${branch} ORDER BY ${Prisma.raw(reference.name)},id`);
}
async function validateSearchReferences(definition:SearchDefinition,target:SearchTarget,user:AuthenticatedUser) {
 const contexts=contextsFor(target);
 for(const [key,table,operation] of [['branchIds','branches','employees.read'],['teamIds','teams','teams.read'],['skillIds','skills','skills.read']] as const){
  const raw=definition.options[key];if(raw===undefined)continue;
  operationScope(user,operation);
  if(typeof raw!=='string')invalidSearch(key);
  const values=raw.split(',');
  if(values.length>100||new Set(values).size!==values.length||values.some(value=>!/^[1-9]\d*$/.test(value)||!Number.isSafeInteger(Number(value))))invalidSearch(key);
  const permitted=await referenceOptions(key,{table,key:'id',name:'name'},user,target);
  if(values.some(value=>!permitted.some(option=>option.value===value)))invalidSearch(key);
 }
 async function visit(node:SearchNode,contextCode:string):Promise<void>{
  if(node.kind==='group'){
   if(node.context==='branchCopies'){
    if(node.mode!=='all'||node.match!=='some'||node.children.length!==2)invalidSearch('branchCopies');
    const selection=node.children.find(child=>child.kind==='rule'&&child.field==='selection');
    const count=node.children.find(child=>child.kind==='rule'&&child.field==='copyCount');
    if(!selection||selection.kind!=='rule'||selection.operator!=='eq'||!count||count.kind!=='rule'||!['eq','ne','gt','gte','lt','lte','between'].includes(count.operator))invalidSearch('branchCopies');
    const values=Array.isArray(count.value)?count.value:[count.value];
    if(values.some(value=>typeof value!=='number'||!Number.isSafeInteger(value)||value<0))invalidSearch('copyCount');
   }
   for(const child of node.children)await visit(child,node.context??contextCode);return;
  }
  const field=contexts.find(ctx=>ctx.code===contextCode)!.fields.find(f=>f.code===node.field)!;
  if(!field.reference||['set','unset'].includes(node.operator))return;
  const options=await referenceOptions(contextCode,field.reference,user,target);
  const values=Array.isArray(node.value)?node.value:[node.value];
  if(values.some(value=>!options.some(option=>option.value===value)))invalidSearch('selection');
 }
 await visit(definition.conditions,contexts[0].code);
}
