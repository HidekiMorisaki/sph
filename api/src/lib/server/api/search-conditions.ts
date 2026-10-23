import { Prisma } from '$lib/server/generated/prisma/client';
import type { AuthenticatedUser } from '$lib/server/auth/types';
import { employeeReferenceDate } from './employee-derived';
import { contextScope, contextsFor, operationScope, operatorsFor, type SearchTarget, type SearchField, type SearchContext } from './search-registry';
import { throwApiError } from './response';
import { canonicalIsbn } from './book-isbn';

export type SearchRule = { kind: 'rule'; field: string; operator: string; value?: string | number | boolean | Array<string | number> };
export type SearchGroup = { kind: 'group'; mode: 'all' | 'any'; context?: string; match?: 'some' | 'none'; children: SearchNode[] };
export type SearchNode = SearchRule | SearchGroup;
export type SearchDefinition = { schemaVersion: 1; keyword: string; conditions: SearchGroup; sortBy: string; sortOrder: 'asc' | 'desc'; limit: number; options: Record<string, string | boolean> };
export const employeeSorts = ['id','employee','employeeCode','firstName','lastName','age','lengthOfService','department','group','teams','position','employmentType','branch','roles','hiredAt','createdAt','updatedAt'] as const;
export const assetSorts = ['id','assetTag','type','manufacturer','modelNumber','serialNumber','branch','room','storage','user','status','ramGb','purchasedOn','disposalOn','createdAt','updatedAt'] as const;
export const bookSorts = ['name','author','isbn','createdAt'] as const;
export function invalidSearch(field = 'definition'): never { return throwApiError(422,'INVALID_SEARCH_CONDITION','One or more search conditions are invalid.',[{field,reason:'INVALID_VALUE'}]); }
export function searchObject(value: unknown): Record<string, unknown> { if(!value||typeof value!=='object'||Array.isArray(value))invalidSearch(); return value as Record<string,unknown>; }
function keys(body: Record<string,unknown>, allowed: string[]) { if(Object.keys(body).some(key=>!allowed.includes(key)))invalidSearch(); }
export async function searchBody(request: Request) {
 const reader = request.body?.getReader(); if(!reader)invalidSearch('body');
 const parts: Uint8Array[]=[]; let length=0;
 try { while(true) { const {done,value}=await reader.read(); if(done)break; length+=value.byteLength; if(length>65536){await reader.cancel();invalidSearch('body');}parts.push(value); } } finally {reader.releaseLock();}
 const bytes=new Uint8Array(length); let offset=0; for(const part of parts){bytes.set(part,offset);offset+=part.length;}
 try{return searchObject(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)));}catch{invalidSearch('body');}
}
function validScalar(field: SearchField, value: unknown): string | number | boolean {
 if(field.source==='BookTitle.isbn'&&typeof value==='string')value=canonicalIsbn(value)??value.replace(/[\s-]/g,'').toUpperCase();
 if(field.type==='boolean'){if(typeof value!=='boolean')invalidSearch(field.code);return value;}
 if(field.type==='number'){if(typeof value!=='number'||!Number.isFinite(value)||Math.abs(value)>1e15)invalidSearch(field.code);return value;}
 if(typeof value!=='string'||!value.trim()||value.length>Math.min(field.maxLength,500))invalidSearch(field.code);
 if(field.type==='date'){
  if(!/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value))invalidSearch(field.code);
  const date=new Date(value+'T00:00:00Z'); if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==value)invalidSearch(field.code);
 }
 if(field.type==='datetime'){
  const day=new Date(value.slice(0,10)+'T00:00:00Z');if(!Number.isFinite(day.getTime())||day.toISOString().slice(0,10)!==value.slice(0,10)||Number(value.slice(11,13))>23)invalidSearch(field.code);
  if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d(:\d\d(\.\d{1,3})?)?(Z|[+-]\d\d:\d\d)$/.test(value)||!Number.isFinite(Date.parse(value)))invalidSearch(field.code);
  return new Date(value).toISOString();
 }
 if(field.choices&&!field.choices.includes(value))invalidSearch(field.code);
 return value.trim();
}
function parseNode(value: unknown,target: SearchTarget,user: AuthenticatedUser,depth: number,state: {rules:number;nodes:number},context: SearchContext): SearchNode {
 if(depth>3||++state.nodes>150)invalidSearch('conditions');
 const body=searchObject(value);
 if(body.kind==='group'){
  keys(body,['kind','mode','context','match','children']);
  if(!['all','any'].includes(String(body.mode))||!Array.isArray(body.children)||body.children.length>50)invalidSearch('conditions');
  let active=context;
  if(body.context!==undefined){
   if(depth===0||context.from||typeof body.context!=='string')invalidSearch('context');
   const found=contextsFor(target).find(ctx=>ctx.code===body.context&&ctx.from); if(!found)invalidSearch('context');active=found;
   if(!['some','none'].includes(String(body.match)))invalidSearch('match');
   contextScope(active,user,target);
  }else if(body.match!==undefined)invalidSearch('match');
  if(depth>0&&!body.children.length&&body.context===undefined)invalidSearch('conditions');
  return {kind:'group',mode:body.mode as 'all'|'any',...(body.context!==undefined?{context:active.code,match:body.match as 'some'|'none'}:{}),children:body.children.map(node=>parseNode(node,target,user,depth+1,state,active))};
 }
 keys(body,['kind','field','operator','value']);
 if(body.kind!=='rule'||++state.rules>50||typeof body.field!=='string'||typeof body.operator!=='string')invalidSearch('conditions');
 const field=context.fields.find(f=>f.code===body.field); if(!field||!operatorsFor(field).includes(body.operator))invalidSearch('field');
 if(field.operation){const scope=operationScope(user,field.operation);if(scope!==null&&!context.branch)throwApiError(403,'SEARCH_FIELD_FORBIDDEN','Search field is not permitted.');}
 const rule: SearchRule={kind:'rule',field:field.code,operator:body.operator};
 if(['set','unset'].includes(body.operator)){if(body.value!==undefined)invalidSearch(field.code);return rule;}
 if(body.operator==='relative'){
  if(!Array.isArray(body.value)||body.value.length!==2||body.value.some(v=>typeof v!=='number'||!Number.isSafeInteger(v)||Math.abs(v)>36500)||body.value[0]>body.value[1])invalidSearch(field.code);
  rule.value=body.value;return rule;
 }
 if(['between','in','notIn'].includes(body.operator)){
  if(!Array.isArray(body.value)||!body.value.length||body.value.length>100||(body.operator==='between'&&body.value.length!==2))invalidSearch(field.code);
  const values=body.value.map(item=>validScalar(field,item));
  if(values.some(v=>typeof v==='boolean'))invalidSearch(field.code);
  if(body.operator==='between'&&values[0]>values[1])invalidSearch(field.code);
  rule.value=values as Array<string|number>;return rule;
 }
 rule.value=validScalar(field,body.value);return rule;
}
export function parseSearchDefinition(value: unknown,target: SearchTarget,user: AuthenticatedUser): SearchDefinition {
 const body=searchObject(value);keys(body,['schemaVersion','keyword','conditions','sortBy','sortOrder','limit','options']);
 if(body.schemaVersion!==1||typeof body.keyword!=='string'||body.keyword.length>500)invalidSearch('keyword');
 const sorts: readonly string[]=target==='employees'?employeeSorts:target==='assets'?assetSorts:bookSorts;
 if(typeof body.sortBy!=='string'||!sorts.includes(body.sortBy)||!['asc','desc'].includes(String(body.sortOrder)))invalidSearch('sort');
 if(body.sortBy==='teams')operationScope(user,'teams.read');
 if(typeof body.limit!=='number'||!Number.isInteger(body.limit)||body.limit<1||body.limit>500)invalidSearch('limit');
 const options=searchObject(body.options??{});
 keys(options,target==='employees'?['includeRetired','includeDeleted','branchIds','teamIds','skillIds','skillMode','minProficiency','participationStatus','endingWithinDays']:target==='assets'?['typeIds','branchId','unassigned']:['purchaseRequests']);
 for(const [key,val] of Object.entries(options)){
  if(['includeRetired','includeDeleted','purchaseRequests','unassigned'].includes(key)){if(typeof val!=='boolean')invalidSearch(key);}
  else if(typeof val!=='string'||val.length>1000)invalidSearch(key);
 }
 if(options.skillIds)operationScope(user,'skills.read');
 if(options.participationStatus||options.endingWithinDays)operationScope(user,'projects.read');
 const conditions=parseNode(body.conditions,target,user,0,{rules:0,nodes:0},contextsFor(target)[0]);
 if(conditions.kind!=='group')invalidSearch('conditions');
 if(conditions.children.length&&options.includeDeleted===true)invalidSearch('includeDeleted');
 return {schemaVersion:1,keyword:body.keyword.trim(),conditions,sortBy:body.sortBy,sortOrder:body.sortOrder as 'asc'|'desc',limit:body.limit,options:options as SearchDefinition['options']};
}
const escapeLike=(value:string)=>value.replace(/[\\%_]/g,char=>'\\'+char);
function midnight(date: string,timeZone: string): Date {
 let candidate=Date.parse(date+'T00:00:00Z');
 const formatter=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
 for(let i=0;i<3;i++) {const parts=Object.fromEntries(formatter.formatToParts(candidate).map(p=>[p.type,p.value]));const represented=Date.parse(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}Z`);candidate+=Date.parse(date+'T00:00:00Z')-represented;}
 return new Date(candidate);
}
function scalarSql(field:SearchField,value:string|number|boolean):Prisma.Sql {
 if(field.type==='date')return Prisma.sql`CAST(${value} AS date)`;
 if(field.type==='datetime')return Prisma.sql`CAST(${value} AS timestamptz)`;
 return Prisma.sql`${value}`;
}
function ruleSql(rule:SearchRule,field:SearchField,user:AuthenticatedUser):Prisma.Sql {
 const raw=Prisma.sql`(${Prisma.raw(field.expression)})`, value=rule.value!;
 const column=field.type==='string'||field.type==='choice'?Prisma.sql`lower((${raw})::text)`:raw;
 const normalize=(value:string|number|boolean)=>scalarSql(field,typeof value==='string'&&['string','choice'].includes(field.type)?value.toLowerCase():value);
 const empty=['string','choice'].includes(field.type)?Prisma.sql`(${raw} IS NULL OR (${raw})::text ~ '^[[:space:]]*$')`:Prisma.sql`${raw} IS NULL`;
 if(rule.operator==='unset')return empty;
 if(rule.operator==='set')return Prisma.sql`NOT (${empty})`;
 if(rule.operator==='relative'){
  const date=field.type==='date'?employeeReferenceDate():midnight(new Intl.DateTimeFormat('en-CA',{timeZone:user.timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),user.timeZone);
  const [start,end]=value as number[];
  if(field.type==='date')return Prisma.sql`${raw} BETWEEN CAST(${new Date(date.getTime()+start*86400000).toISOString().slice(0,10)} AS date) AND CAST(${new Date(date.getTime()+end*86400000).toISOString().slice(0,10)} AS date)`;
  const baseParts=new Intl.DateTimeFormat('en-CA',{timeZone:user.timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const day=(delta:number)=>new Date(Date.parse(baseParts+'T00:00:00Z')+delta*86400000).toISOString().slice(0,10);
  return Prisma.sql`(${raw} >= ${midnight(day(start),user.timeZone)} AND ${raw} < ${midnight(day(end+1),user.timeZone)})`;
 }
 if(rule.operator==='between'){const values=value as Array<string|number>;return Prisma.sql`${column} BETWEEN ${normalize(values[0])} AND ${normalize(values[1])}`;}
 if(rule.operator==='in'||rule.operator==='notIn'){const values=value as Array<string|number>;const expr=Prisma.sql`${column} IN (${Prisma.join(values.map(normalize))})`;return rule.operator==='in'?expr:Prisma.sql`NOT COALESCE((${expr}),false)`;}
 if(rule.operator==='contains'||rule.operator==='notContains'){const expr=Prisma.sql`${column} LIKE ${'%'+escapeLike(String(value).toLowerCase())+'%'}`;return rule.operator==='contains'?expr:Prisma.sql`NOT COALESCE((${expr}),false)`;}
 const operators:Record<string,string>={eq:'=',ne:'=',gt:'>',gte:'>=',lt:'<',lte:'<='};
 const expr=Prisma.sql`${column} ${Prisma.raw(operators[rule.operator])} ${normalize(value as string|number|boolean)}`;
 return rule.operator==='ne'?Prisma.sql`NOT COALESCE((${expr}),false)`:expr;
}
export function compileSearchConditions(definition:SearchDefinition,target:SearchTarget,user:AuthenticatedUser):Prisma.Sql {
 const contexts=contextsFor(target);
 function compile(node:SearchNode,context:SearchContext):Prisma.Sql {
  if(node.kind==='rule'){
   const field=context.fields.find(f=>f.code===node.field)!;
   const scope=field.operation?operationScope(user,field.operation):null;
   const guard=scope===null?Prisma.sql`true`:Prisma.sql`${Prisma.raw(context.branch!)}=${scope}`;
   return Prisma.sql`(${guard} AND (${ruleSql(node,field,user)}))`;
  }
  const active=node.context?contexts.find(ctx=>ctx.code===node.context)!:context;
  const children=node.children.map(child=>compile(child,active));
  const combined=children.length?Prisma.sql`(${Prisma.join(children,node.mode==='all'?' AND ':' OR ')})`:Prisma.sql`true`;
  if(!node.context)return combined;
  const scope=contextScope(active,user,target);
  const exists=Prisma.sql`EXISTS (SELECT 1 FROM ${Prisma.raw(active.from)} WHERE ${Prisma.raw(active.link)} AND ${scope} AND ${combined})`;
  // Private nodes are false outside the owner even for none/OR, never negated guards.
  const privateGuard=active.private || (target==='employees'&&active.policy==='reservations')?Prisma.sql`employee.id=${user.id}`:Prisma.sql`true`;
  return Prisma.sql`(${privateGuard} AND ${node.match==='none'?Prisma.sql`NOT (${exists})`:exists})`;
 }
 return compile(definition.conditions,contexts[0]);
}

export function definitionUrl(definition:SearchDefinition,url:URL,offset=0,includeColumns=false) {
 const result=new URL(url);result.search='';
 result.searchParams.set('offset',String(offset));result.searchParams.set('limit',String(definition.limit));result.searchParams.set('sortBy',definition.sortBy);result.searchParams.set('sortOrder',definition.sortOrder);
 result.searchParams.set('search',definition.keyword);result.searchParams.set('q',definition.keyword);
 for(const [key,value] of Object.entries(definition.options))result.searchParams.set(key,String(value));
 if(includeColumns)result.searchParams.set('includeColumns','true');
 return result;
}
