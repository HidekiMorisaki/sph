import {workflowSearchResults,workflowOptions} from '../workflow/search';
import {ticketSearchResults,ticketReferenceOptions} from '../projects/ticket-search';
import { projectList } from '../projects/service';
import { businessList } from './business-list';
import { isBusinessTarget } from './business-search-registry';
import type { AuthenticatedUser } from '$lib/server/auth/types';
import { requireScopedOperationApi } from './branch-access';
import { employeeList } from './employee-list';
import { assetList } from './it-asset-list';
import { bookList } from './book-list';
import { compileSearchConditions, definitionUrl, invalidSearch, parseSearchDefinition, searchBody, type SearchDefinition } from './search-conditions';
import { searchFieldDefinitions, contextsFor, operationScope, type SearchTarget } from './search-registry';
import { Prisma } from '$lib/server/generated/prisma/client';
import { getPrisma } from '$lib/server/prisma';
import { requireOperationApi } from './admin';
import type { SearchNode } from './search-conditions';
import { success } from './response';
import { parseAssetSummaryFilters } from './it-asset-summary';

export function searchActor(user:AuthenticatedUser|null,target:SearchTarget) {
 if(target==='projects'||target==='projectTickets')return requireOperationApi(user?{...user,activeOperation:undefined}:null,'projects.read');
 if(isBusinessTarget(target))return requireOperationApi(user?{...user,activeOperation:undefined}:null,target+'.read');
 if(target==='workflows')return requireOperationApi(user?{...user,activeOperation:undefined}:null,'workflows.read');
 if(target==='books')return requireOperationApi(user,'books.read');
 return requireScopedOperationApi(user?{...user,activeOperation:undefined}:null,target==='employees'?'employees.read':target==='assets'?'assets.read':'books.read').actor;
}
export async function searchResults(user:AuthenticatedUser|null,target:SearchTarget,request:Request,url:URL) {
 const actor=searchActor(user,target);const body=await searchBody(request);
 const allowedKeys=['definition','offset','includeColumns','visibleSearch','searchLocale',...(target==='projectTickets'?['ticketIds']:[])];
 if(Object.keys(body).some(key=>!allowedKeys.includes(key)))invalidSearch();
 let ticketIds:number[]|undefined;
 if(body.ticketIds!==undefined){
  if(!Array.isArray(body.ticketIds)||body.ticketIds.length<1||body.ticketIds.length>500||body.ticketIds.some(value=>typeof value!=='number'||!Number.isSafeInteger(value)||value<1||value>2147483647)||new Set(body.ticketIds).size!==body.ticketIds.length)invalidSearch('ticketIds');
  ticketIds=body.ticketIds as number[];
 }
 const definition=parseSearchDefinition(body.definition,target,actor);
 await validateSearchReferences(definition,target,actor);
 if(body.offset!==undefined&&(typeof body.offset!=='number'||!Number.isSafeInteger(body.offset)||body.offset<0))invalidSearch('offset');
 if(body.includeColumns!==undefined&&typeof body.includeColumns!=='boolean')invalidSearch('includeColumns');
 const resultUrl=definitionUrl(definition,url,body.offset as number??0,body.includeColumns===true);
 if(target==='employees'||target==='assets'){
  if(target==='employees')resultUrl.searchParams.set('includeAvatar','true');
  if(body.visibleSearch!==undefined){if(typeof body.visibleSearch!=='string'||body.visibleSearch.length>500)invalidSearch('visibleSearch');resultUrl.searchParams.set('visibleSearch',body.visibleSearch);}
  if(body.searchLocale!==undefined){if(!['ja','en'].includes(String(body.searchLocale)))invalidSearch('searchLocale');resultUrl.searchParams.set('searchLocale',String(body.searchLocale));}
 }
 const sql=compileSearchConditions(definition,target,actor);
 const response=await (target==='projectTickets'?ticketSearchResults(actor,definition,sql,body.offset as number??0,url.searchParams.get('projectId'),ticketIds):target==='projects'?projectList(actor,resultUrl,sql):isBusinessTarget(target)?businessList(actor,target,resultUrl,sql):target==='workflows'?workflowSearchResults(actor,definition,sql,body.offset as number??0):target==='employees'?employeeList(actor,resultUrl,sql):target==='assets'?assetList(actor,resultUrl,sql):bookList(actor,resultUrl,sql));
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
 await (target==='projectTickets'?ticketSearchResults(user,parsed,compileSearchConditions(parsed,target,user),0):target==='projects'?projectList(user,url,compileSearchConditions(parsed,target,user)):isBusinessTarget(target)?businessList(user,target,url,compileSearchConditions(parsed,target,user)):target==='workflows'?workflowSearchResults(user,parsed,compileSearchConditions(parsed,target,user)):target==='employees'?employeeList(user,url,compileSearchConditions(parsed,target,user)):target==='assets'?assetList(user,url,compileSearchConditions(parsed,target,user)):bookList(user,url,compileSearchConditions(parsed,target,user)));
 return parsed;
}

async function referenceOptions(contextCode:string,reference:{table:string;key:string;name:string},user:AuthenticatedUser,target:SearchTarget) {
 if(target==='projectTickets')return ticketReferenceOptions(reference.table,user);
 if(target==='workflows')return workflowOptions(reference.table,user);
 const scope=operationScope(user,target==='employees'?'employees.read':target==='assets'?'assets.read':'books.read');
 const branch=scope===null?Prisma.empty:reference.table==='branches'?Prisma.sql`AND id=${scope}`:target==='assets'&&['rooms','storage'].includes(reference.table)?Prisma.sql`AND branch_id=${scope}`:Prisma.empty;
 return getPrisma().$queryRaw<Array<{value:string;label:string}>>(Prisma.sql`SELECT ${Prisma.raw(reference.key)}::text AS value,${Prisma.raw(reference.name)} AS label FROM ${Prisma.raw(reference.table)} WHERE deleted_at IS NULL ${branch} ORDER BY ${Prisma.raw(reference.name)},id`);
}
async function validateSearchReferences(definition:SearchDefinition,target:SearchTarget,user:AuthenticatedUser) {
 const contexts=contextsFor(target);
 if(target==='projectTickets'){
  for(const [key,kind] of [['projectIds','project'],['assigneeIds','assignee'],['typeIds','type'],['statusIds','status'],['categories','category']]){
   const raw=definition.options[key];if(raw===undefined)continue;if(typeof raw!=='string')invalidSearch(key);const values=raw.split(',');
   if(values.length>100||new Set(values).size!==values.length)invalidSearch(key);
   const permitted=kind==='category'?['open','active','done','cancelled'].map(value=>({value})):await ticketReferenceOptions('project_ticket_'+kind,user);
   if(values.some(value=>!(key==='assigneeIds'&&value==='unassigned')&&!permitted.some(p=>p.value===value)))invalidSearch(key);
  }
 }
 if(target==='workflows'){
  if(definition.options.view!==undefined&&!['all','mine','pending'].includes(String(definition.options.view)))invalidSearch('view');
  if(definition.options.statuses){const values=String(definition.options.statuses).split(',');if(values.length>6||new Set(values).size!==values.length||values.some(value=>!['draft','pending','returned','approved','rejected','cancelled'].includes(value)))invalidSearch('statuses');}
  for(const [key,kind] of [['applicantIds','applicant'],['approverIds','approver'],['finalApproverIds','finalApprover'],['currentAssigneeIds','currentAssignee'],['templateIds','template']]){
   if(definition.options[key]===undefined)continue;
   const raw=definition.options[key];if(typeof raw!=='string')invalidSearch(key);const values=raw.split(',');
   if(values.length>100||new Set(values).size!==values.length||values.some(value=>!/^[1-9]\d*$/.test(value)||!Number.isSafeInteger(Number(value))))invalidSearch(key);
   const permitted=await workflowOptions('workflow_'+kind,user);if(values.some(value=>!permitted.some(option=>option.value===value)))invalidSearch(key);
  }
 }

 if(target==='assets'){
  parseAssetSummaryFilters(definitionUrl(definition,new URL('http://search.invalid')),operationScope(user,'assets.read'));
  if(definition.options.branchId!==undefined){
   const branches=await referenceOptions('asset',{table:'branches',key:'id',name:'name'},user,target);
   if(!branches.some(item=>item.value===definition.options.branchId))invalidSearch('branchId');
  }
  const raw=definition.options.typeIds;
  if(raw!==undefined){
   if(typeof raw!=='string')invalidSearch('typeIds');
   const ids=raw.split(',');
   if(ids.length>100||new Set(ids).size!==ids.length||ids.some(id=>!/^[1-9]\d*$/.test(id)||!Number.isSafeInteger(Number(id))))invalidSearch('typeIds');
   const permitted=await referenceOptions('asset',{table:'it_asset_types',key:'id',name:'name'},user,target);
   if(ids.some(id=>!permitted.some(item=>item.value===id)))invalidSearch('typeIds');
  }
 }
 for(const [key,table,operation] of [['branchIds','branches','employees.read'],['teamIds','teams','teams.read'],['skillIds','skills','skills.read']] as const){
  if(target!=='employees')continue;
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
