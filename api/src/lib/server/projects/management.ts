import {Prisma} from '#lib/server/generated/prisma/client.js';
import {getPrisma} from '#lib/server/prisma.js';
import {requireOperationApi,writeAuditLog} from '#lib/server/api/admin.js';
import {success,throwApiError} from '#lib/server/api/response.js';
import {parseListQuery,listMeta} from '#lib/server/api/query.js';
import type {AuthenticatedUser} from '#lib/server/auth/types.js';
import {access} from './service';
import {calculateEvm,laborCost,type EvmCurrency} from './evm-calculations';

const D=Prisma.Decimal.clone({precision:48,rounding:Prisma.Decimal.ROUND_HALF_UP});
type Tx=Prisma.TransactionClient;
type Actor=AuthenticatedUser;
type Event={locals:{user:Actor|null};request:Request;url:URL;params:Record<string,string|undefined>};
type Body=Record<string,unknown>;
function fail(code:string,status=422):never{return throwApiError(status,code,code);}
const oid=(v:unknown)=>{if(typeof v!=='number'||!Number.isSafeInteger(v)||v<1||v>2147483647)fail('INVALID_ID');return v;};
const text=(v:unknown,max=500)=>{if(typeof v!=='string'||!v.trim()||v.length>max)fail('INVALID_TEXT');return v.trim();};
const money=(v:unknown,currency?:string)=>{if(typeof v!=='string'||v.length>24||!/^\d+(\.\d{1,2})?$/.test(v))fail('INVALID_AMOUNT');const n=new D(v);if(n.gt('999999999999999999.99')||currency==='JPY'&&n.decimalPlaces()>0)fail('INVALID_AMOUNT');return n;};
const numberValue=(v:unknown)=>{if(typeof v!=='string'||v.length>24||!/^[-+]?\d+(\.\d{1,6})?$/.test(v))fail('INVALID_NUMBER');const n=new D(v);if(n.abs().gt('99999999999999.999999'))fail('INVALID_NUMBER');return n;};
const day=(v:unknown)=>{if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v))fail('INVALID_DATE');const n=new Date(v+'T00:00:00Z');if(!Number.isFinite(n.getTime())||n.toISOString().slice(0,10)!==v)fail('INVALID_DATE');return n;};
const month=(v:unknown)=>{if(typeof v!=='string'||!/^\d{4}-\d{2}$/.test(v))fail('INVALID_MONTH');return day(v+'-01');};
const json=(v:unknown)=>JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
const keys=(b:Body,allowed:string[])=>{if(Object.keys(b).some(k=>!allowed.includes(k)))fail('INVALID_FIELD');};
const revision=(b:Body,n:number)=>{if(b.revision!==n)fail('REVISION_CONFLICT',409);};
function conflict(error:unknown):never{const code=(error as {code?:string}).code;if(code==='P2034'||code==='P2002')fail(code==='P2002'?'DUPLICATE_RECORD':'REVISION_CONFLICT',409);throw error;}
const audit=(tx:Tx,a:Actor,action:string,id:number)=>writeAuditLog(tx,a.id,action,'project_management',id);
async function project(tx:Tx,a:Actor,id:number,operation='projects.financial.read',write=false){requireOperationApi(a,'projects.read');requireOperationApi(a,operation);const r=await access(tx,a,id,write,write);if(write&&r.p.status==='archived')fail('PROJECT_ARCHIVED',409);return r;}
export async function staleEvm(tx:Tx,projectId:number){await tx.projectEvmReport.updateMany({where:{projectId,deletedAt:null,stale:false},data:{stale:true}});}
async function config(tx:Tx,projectId:number){const c=await tx.projectEvmSetting.findFirst({where:{projectId,deletedAt:null,enabled:true}});if(!c)fail('EVM_NOT_ENABLED',409);return c;}
async function ticket(tx:Tx,projectId:number,id:number){const t=await tx.projectTicket.findFirst({where:{id,projectId,deletedAt:null}});if(!t)fail('INVALID_TICKET');return t;}
export async function evmReport(tx:Tx,a:Actor,projectId:number,baselineId:number,reportMonth:Date){
 await project(tx,a,projectId);const c=await config(tx,projectId),currency=c.currency as EvmCurrency;if(reportMonth<c.startMonth)fail('BEFORE_EVM_START');
 const baseline=await tx.projectBaseline.findFirst({where:{id:baselineId,projectId,deletedAt:null,state:'confirmed'},include:{ProjectBaselineItem_baselineId:{where:{deletedAt:null},include:{ProjectBaselineMonth_itemId:{where:{deletedAt:null}}}}}});if(!baseline)fail('BASELINE_REQUIRED');
 const end=new Date(Date.UTC(reportMonth.getUTCFullYear(),reportMonth.getUTCMonth()+1,1));
 const rates=await tx.projectCostRate.findMany({where:{projectId,deletedAt:null},orderBy:{startsOn:'desc'}});
 const time=await tx.projectTimeEntry.findMany({where:{deletedAt:null,workDate:{gte:c.startMonth,lt:end},ticket:{projectId}},orderBy:{id:'asc'}});
 const expenses=await tx.projectExpense.findMany({where:{projectId,deletedAt:null,incurredOn:{gte:c.startMonth,lt:end}},orderBy:{id:'asc'}});
 const tickets=(baseline.scopeSnapshot as {tickets:Array<{id:number;parentId:number|null}>}).tickets??[],byId=new Map(tickets.map(t=>[t.id,t]));
 const rows=[],unresolved:string[]=[],evidence=[];const itemIds=new Set(baseline.ProjectBaselineItem_baselineId.map(i=>i.ticketId));
 const map=(id:number)=>{const seen=new Set<number>();let current:number|null=id;while(current!==null&&!seen.has(current)){if(itemIds.has(current))return current;seen.add(current);current=byId.get(current)?.parentId??null;}return null;};
 const actual=new Map<number,Prisma.Decimal>();
 for(const t of time){const rate=rates.find(r=>r.startsOn<=t.workDate),work=map(t.ticketId);if(!rate||!work){unresolved.push(!rate?'MISSING_RATE':'UNMAPPED_TIME');continue;}const amount=laborCost(t.minutes.toString(),rate.hourlyRate.toString(),currency);actual.set(work,(actual.get(work)??new D(0)).add(amount));evidence.push({source:'time',id:t.id,ticketId:t.ticketId,updatedAt:t.updatedAt,minutes:t.minutes.toString(),workDate:t.workDate,rateId:rate.id,rate:rate.hourlyRate.toString(),amount,work});}
 for(const e of expenses){const work=map(e.ticketId);if(!work){unresolved.push('UNMAPPED_EXPENSE');continue;}actual.set(work,(actual.get(work)??new D(0)).add(e.amount));evidence.push({source:'expense',...e,work});}
 for(const item of baseline.ProjectBaselineItem_baselineId){
  const progress=await tx.projectProgressRecord.findFirst({where:{projectId,ticketId:item.ticketId,month:reportMonth,deletedAt:null},orderBy:{version:'desc'}});if(!progress)unresolved.push('MISSING_MONTHLY_PROGRESS');
  const planned=item.ProjectBaselineMonth_itemId.filter(p=>p.month<=reportMonth).reduce((n,p)=>n.add(p.amount),new D(0));
  rows.push({ticketId:item.ticketId,title:item.title,budget:item.budget.toString(),planned:planned.toString(),progress:progress?.percent.toString()??'0',actual:(actual.get(item.ticketId)??new D(0)).toString(),progressRecord:progress});
 }
 return {baselineId,baselineVersion:baseline.version,month:reportMonth.toISOString().slice(0,7),currency,rows,evidence,unresolved:[...new Set(unresolved)],totals:unresolved.length?null:calculateEvm(rows,currency)};
}

export async function evmApi(e:Event,resource:string){
 const a=requireOperationApi(e.locals.user,'projects.financial.read'),projectId=oid(Number(e.params.id)),recordId=e.params.recordId?oid(Number(e.params.recordId)):null,method=e.request.method;
 if(method!=='GET'&&((resource==='evm-settings'&&method!=='PATCH')||(['baselines','progress-records','evm-reports'].includes(resource)&&(method!=='POST'||recordId!==null))||(['cost-rates','expenses'].includes(resource)&&!((method==='POST'&&recordId===null)||(['PATCH','DELETE'].includes(method)&&recordId!==null)))||resource==='evm-preview'))fail('METHOD_NOT_ALLOWED',405);
 const b=method==='GET'?{}:await e.request.json().catch(()=>fail('INVALID_JSON')) as Body;if(!b||Array.isArray(b)||typeof b!=='object')fail('INVALID_JSON');
 return getPrisma().$transaction(async tx=>{
  await tx.$queryRaw`SELECT id FROM projects WHERE id=${projectId} FOR UPDATE`;
  const p=await project(tx,a,projectId,method==='GET'?'projects.financial.read':'projects.financial.manage',method!=='GET');
  if(method==='GET'){
   if(resource==='evm-settings')return success(await tx.projectEvmSetting.findFirst({where:{projectId,deletedAt:null}}));
   const listUrl=new URL(e.url);if(!listUrl.searchParams.has('sortOrder'))listUrl.searchParams.set('sortOrder','desc');const q=parseListQuery(listUrl,['id','createdAt'] as const,'id'),where={projectId,deletedAt:null},orderBy=[{[q.sortBy]:q.sortOrder},{id:q.sortOrder}];
   if(resource==='evm-preview'){const baselineId=oid(Number(e.url.searchParams.get('baselineId')));return success(await evmReport(tx,a,projectId,baselineId,month(e.url.searchParams.get('month'))));}
   if(resource==='cost-rates'){const items=await tx.projectCostRate.findMany({where,orderBy,take:q.limit,skip:q.offset});return success(items,200,listMeta(q,items.length,await tx.projectCostRate.count({where})));}
   if(resource==='expenses'){const items=await tx.projectExpense.findMany({where,orderBy,take:q.limit,skip:q.offset});return success(items,200,listMeta(q,items.length,await tx.projectExpense.count({where})));}
   if(resource==='progress-records'){const items=await tx.projectProgressRecord.findMany({where,orderBy,take:q.limit,skip:q.offset});return success(items,200,listMeta(q,items.length,await tx.projectProgressRecord.count({where})));}
   if(resource==='baselines'){const items=await tx.projectBaseline.findMany({where,orderBy,take:q.limit,skip:q.offset,include:{ProjectBaselineItem_baselineId:{where:{deletedAt:null},include:{ProjectBaselineMonth_itemId:{where:{deletedAt:null}}}}}});return success(items,200,listMeta(q,items.length,await tx.projectBaseline.count({where})));}
   if(resource==='evm-reports'){const items=await tx.projectEvmReport.findMany({where,orderBy,take:q.limit,skip:q.offset});return success(items,200,listMeta(q,items.length,await tx.projectEvmReport.count({where})));}
   fail('NOT_FOUND',404);
  }
  if(resource==='evm-settings'){
   keys(b,['enabled','currency','startMonth','revision']);if(typeof b.enabled!=='boolean'||!['JPY','USD'].includes(String(b.currency)))fail('INVALID_EVM_SETTINGS');const old=await tx.projectEvmSetting.findFirst({where:{projectId}});if(old)revision(b,old.revision);
   if(old&&(old.currency!==b.currency||old.startMonth.getTime()!==month(b.startMonth).getTime())&&await tx.projectBaseline.count({where:{projectId,state:'confirmed'}}))fail('CONFIRMED_EVM_SETTINGS_IMMUTABLE',409);
   const data={enabled:b.enabled,currency:String(b.currency),startMonth:month(b.startMonth)};const row=await tx.projectEvmSetting.upsert({where:{projectId},create:{projectId,...data},update:{...data,revision:{increment:1}}});await staleEvm(tx,projectId);await audit(tx,a,'evm.settings.saved',row.id);return success(row);
  }
  const c=await config(tx,projectId);
  if(resource==='cost-rates'){
   keys(b,['startsOn','hourlyRate','revision']);const data={startsOn:day(b.startsOn),hourlyRate:money(b.hourlyRate,c.currency)};
   const old=recordId?await tx.projectCostRate.findFirst({where:{id:recordId,projectId,deletedAt:null}}):null;if(recordId&&!old)fail('NOT_FOUND',404);if(old)revision(b,old.revision);
   const row=old?await tx.projectCostRate.update({where:{id:old.id},data:{...data,revision:{increment:1},...(method==='DELETE'?{deletedAt:new Date()}:{})}}):await tx.projectCostRate.create({data:{projectId,...data}});await staleEvm(tx,projectId);await audit(tx,a,'evm.rate.saved',row.id);return success(row,old?200:201);
  }
  if(resource==='expenses'){
   keys(b,['code','ticketId','incurredOn','amount','category','evidence','revision']);const ticketId=oid(b.ticketId);await ticket(tx,projectId,ticketId);const incurredOn=day(b.incurredOn);if(incurredOn<c.startMonth)fail('BEFORE_EVM_START');
   const data={code:text(b.code,64),ticketId,incurredOn,amount:money(b.amount,c.currency),category:text(b.category,100),evidence:text(b.evidence,5000)};const old=recordId?await tx.projectExpense.findFirst({where:{id:recordId,projectId,deletedAt:null}}):null;if(recordId&&!old)fail('NOT_FOUND',404);if(old)revision(b,old.revision);
   const row=old?await tx.projectExpense.update({where:{id:old.id},data:{...data,revision:{increment:1},...(method==='DELETE'?{deletedAt:new Date()}:{})}}):await tx.projectExpense.create({data:{projectId,authorId:a.id,...data}});await staleEvm(tx,projectId);await audit(tx,a,'evm.expense.saved',row.id);return success(row,old?200:201);
  }
  if(resource==='progress-records'){
   keys(b,['ticketId','month','percent','evidence']);const ticketId=oid(b.ticketId);await ticket(tx,projectId,ticketId);const m=month(b.month),percent=numberValue(b.percent);if(percent.lt(0)||percent.gt(100)||percent.decimalPlaces()>2||m<c.startMonth)fail('INVALID_PROGRESS');
   const latest=await tx.projectProgressRecord.findFirst({where:{projectId,ticketId,month:m},orderBy:{version:'desc'}});const row=await tx.projectProgressRecord.create({data:{projectId,ticketId,month:m,percent,evidence:text(b.evidence,5000),authorId:a.id,version:(latest?.version??0)+1}});await staleEvm(tx,projectId);await audit(tx,a,'evm.progress.created',row.id);return success(row,201);
  }
  if(resource==='baselines'){
   keys(b,['title','reason','items','state','revision']);if(recordId)fail('BASELINE_APPEND_ONLY',409);if(!Array.isArray(b.items)||!b.items.length||b.items.length>500)fail('INVALID_BASELINE');
   const state=b.state==='confirmed'?'confirmed':'draft';if(state==='confirmed')requireOperationApi(a,'projects.baselines.confirm');
   const prior=await tx.projectBaseline.findFirst({where:{projectId},orderBy:{version:'desc'}});
   if(b.revision!==(prior?.version??0))fail('REVISION_CONFLICT',409);
   const rows=[];const seen=new Set<number>();for(const raw of b.items){if(!raw||typeof raw!=='object'||Array.isArray(raw))fail('INVALID_BASELINE');const item=raw as Body;keys(item,['ticketId','budget','months']);const t=await ticket(tx,projectId,oid(item.ticketId));if(seen.has(t.id))fail('DUPLICATE_WORK');seen.add(t.id);const budget=money(item.budget,c.currency);if(!Array.isArray(item.months)||!item.months.length||item.months.length>1200)fail('INVALID_MONTH_PLAN');const months=[],set=new Set<string>();let total=new D(0);for(const rawMonth of item.months){const m=rawMonth as Body;keys(m,['month','amount']);const date=month(m.month),amount=money(m.amount,c.currency);if(date<c.startMonth||set.has(String(m.month)))fail('INVALID_MONTH_PLAN');set.add(String(m.month));total=total.add(amount);months.push({month:date,amount});}if(!total.eq(budget))fail('BUDGET_ALLOCATION_MISMATCH');rows.push({ticketId:t.id,title:t.title,budget,months});}
   const all=await tx.projectTicket.findMany({where:{projectId},select:{id:true,parentId:true}}),parents=new Map(all.map(t=>[t.id,t.parentId]));for(const id of seen){let parent=parents.get(id);const visited=new Set<number>();while(parent){if(seen.has(parent))fail('OVERLAPPING_WORK_PACKAGES');if(visited.has(parent))fail('HIERARCHY_CYCLE');visited.add(parent);parent=parents.get(parent);}}
   const row=await tx.projectBaseline.create({data:{projectId,version:(prior?.version??0)+1,title:text(b.title,200),reason:text(b.reason,5000),scopeSnapshot:json({tickets:all}),state,confirmedAt:state==='confirmed'?new Date():null,authorId:a.id}});
   for(const item of rows){const i=await tx.projectBaselineItem.create({data:{baselineId:row.id,ticketId:item.ticketId,title:item.title,budget:item.budget}});await tx.projectBaselineMonth.createMany({data:item.months.map(m=>({itemId:i.id,...m}))});}
   await audit(tx,a,'evm.baseline.created',row.id);return success(row,201);
  }
  if(resource==='evm-reports'){
   requireOperationApi(a,'projects.evm.confirm');keys(b,['baselineId','month','revision']);const m=month(b.month),today=new Date();if(new Date(Date.UTC(m.getUTCFullYear(),m.getUTCMonth()+1,1))>today)fail('MONTH_NOT_FINISHED');
   const prior=await tx.projectEvmReport.findFirst({where:{projectId,month:m},orderBy:{version:'desc'}});if(b.revision!==(prior?.version??0))fail('REVISION_CONFLICT',409);
   const snapshot=await evmReport(tx,a,projectId,oid(b.baselineId),m);if(snapshot.unresolved.length)fail('EVM_UNRESOLVED',409);
   const row=await tx.projectEvmReport.create({data:{projectId,baselineId:oid(b.baselineId),month:m,version:(prior?.version??0)+1,snapshot:json(snapshot),authorId:a.id}});await audit(tx,a,'evm.report.confirmed',row.id);return success(row,201);
  }
  void p;fail('NOT_FOUND',404);
 },{isolationLevel:'Serializable',timeout:30000}).catch(conflict);
}
