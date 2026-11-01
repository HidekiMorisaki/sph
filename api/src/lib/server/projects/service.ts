import {bindMarkdownImages} from './markdown-images';
import { Prisma, type Project, type ProjectTicket } from '$lib/server/generated/prisma/client';
import { getPrisma } from '$lib/server/prisma';
import type { AuthenticatedUser } from '$lib/server/auth/types';
import { requireOperationApi, writeAuditLog } from '$lib/server/api/admin';
import { throwApiError } from '$lib/server/api/response';
import {projectSuccess as success,timeMinutes} from './time';
import { searchBody } from '$lib/server/api/search-conditions';
import { listMeta, parseListQuery } from '$lib/server/api/query';
import { emitNotification } from '$lib/server/notifications/producer';
import { validateProjectAttachment } from './attachment';
import {normalizeProjectCode,ticketCode,parseTicketCode} from './codes';

type Tx=Prisma.TransactionClient;
type Actor=AuthenticatedUser;
type Body=Record<string,unknown>;
type Event={locals:{user:Actor|null};params:Record<string,string|undefined>;request:Request;url:URL};
function fail(code:string,status=422):never{return throwApiError(status,code,code);}
function missing():never{return fail('NOT_FOUND',404);}
const allowed=(a:Actor,op:string)=>a.permissionOperations.includes('projects.'+op);
const administrator=(a:Actor)=>allowed(a,'admin')&&a.permissionOperations.includes('system.manage');
export const projectSorts=['id','code','name','status','visibility','createdAt','updatedAt'] as const;
const personSelect={id:true,employeeCode:true,firstName:true,lastName:true} as const;
const activeEmployee={deletedAt:null,accountStatus:'active' as const,OR:[{retiredAt:null},{retiredAt:{gt:new Date()}}]};
function keys(b:Body,names:string[]){if(Object.keys(b).some(k=>!names.includes(k)))fail('INVALID_FIELD');}
function str(v:unknown,max=5000,blank=true,preserve=false):string{if(typeof v!=='string'||v.length>max||(!blank&&!v.trim()))fail('INVALID_TEXT');return preserve?v:v.trim();}
function integer(v:unknown,min=1,max=2147483647):number{if(typeof v!=='number'||!Number.isSafeInteger(v)||v<min||v>max)fail('INVALID_NUMBER');return v;}
function id(v:unknown):number{if(typeof v==='string'&&/^[1-9]\d*$/.test(v))return integer(Number(v));return integer(v);}
async function projectIdentity(tx:Tx,value:string){
 if(/^[1-9]\d*$/.test(value))return id(value);
 if(normalizeProjectCode(value)!==value)missing();
 const p=await tx.project.findUnique({where:{code:value},select:{id:true}});if(!p)missing();return p.id;
}
function option<T extends string>(v:unknown,values:readonly T[]):T{if(!values.includes(v as T))fail('INVALID_OPTION');return v as T;}
function date(v:unknown):Date|null{if(v===null||v==='')return null;if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v))fail('INVALID_DATE');const d=new Date(v+'T00:00:00Z');if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==v)fail('INVALID_DATE');return d;}
function revision(b:Body,current:number){if(b.revision!==current)fail('REVISION_CONFLICT',409);}
export const projectVisibility=(a:Actor)=>administrator(a)?Prisma.sql`true`:Prisma.sql`(p.visibility='internal' OR EXISTS (SELECT 1 FROM project_members m WHERE m.project_id=p.id AND m.employee_id=${a.id} AND m.deleted_at IS NULL))`;

export async function projectList(user:Actor|null,url:URL,conditions:Prisma.Sql=Prisma.sql`true`){
 const a=requireOperationApi(user,'projects.read'),q=parseListQuery(url,projectSorts,'name');
 const term=url.searchParams.get('search')??'';if(term.length>500)fail('INVALID_SEARCH');
 const pattern='%'+term.replace(/[\\%_]/g,c=>'\\'+c)+'%';
 const column={id:'id',code:'code',name:'name',status:'status',visibility:'visibility',createdAt:'created_at',updatedAt:'updated_at'}[q.sortBy];
 return getPrisma().$transaction(async tx=>{
  const where=Prisma.sql`p.deleted_at IS NULL AND ${projectVisibility(a)} AND (${conditions}) AND (p.name ILIKE ${pattern} OR p.code ILIKE ${pattern} OR p.description ILIKE ${pattern})`;
  const [total]=await tx.$queryRaw<{count:number}[]>(Prisma.sql`SELECT count(*)::int AS count FROM projects p WHERE ${where}`);
  const ids=await tx.$queryRaw<{id:number}[]>(Prisma.sql`SELECT p.id FROM projects p WHERE ${where} ORDER BY p.${Prisma.raw(column)} ${q.sortOrder==='asc'?Prisma.sql`ASC`:Prisma.sql`DESC`}, p.id OFFSET ${q.offset} LIMIT ${q.limit}`);
  const rows=await tx.project.findMany({where:{id:{in:ids.map(r=>r.id)},deletedAt:null},omit:{engagementId:true,nextTicketNumber:true}});
  return success(ids.map(r=>rows.find(x=>x.id===r.id)!),200,listMeta(q,rows.length,total.count));
 },{isolationLevel:'RepeatableRead'});
}
export async function access(tx:Tx,a:Actor,projectId:number,write=false,manager=false){
 const p=await tx.project.findFirst({where:{id:projectId,deletedAt:null}});if(!p)missing();
 const m=await tx.projectMember.findFirst({where:{projectId,employeeId:a.id,deletedAt:null}});
 const admin=administrator(a);
 if(!admin&&!m&&p.visibility!=='internal')fail('PROJECT_ACCESS_REQUIRED',403);
 if(write&&!admin&&(!m||m.role==='viewer'||manager&&m.role!=='manager'))fail('PROJECT_EDIT_REQUIRED',403);
 if(admin&&!write&&!m&&p.visibility==='private')await writeAuditLog(tx,a.id,'project.admin_read','projects',projectId);
 return {p,role:admin?'manager':m?.role??'reader',admin};
}
async function log(tx:Tx,a:Actor,projectId:number,kind:string,detail:Prisma.InputJsonValue,ticketId:number|null=null){
 await tx.projectHistory.create({data:{projectId,ticketId,actorId:a.id,kind,detail}});
 await writeAuditLog(tx,a.id,kind,'projects',projectId,{ticketId});
}
async function employee(tx:Tx,employeeId:number){if(!await tx.employee.findFirst({where:{id:employeeId,...activeEmployee},select:{id:true}}))fail('INVALID_EMPLOYEE');}
async function managerEligible(tx:Tx,employeeId:number){
 const rows=await tx.$queryRaw<{eligible:boolean}[]>`SELECT EXISTS (
  SELECT 1 FROM employees e JOIN employee_roles er ON er.employee_id=e.id AND er.deleted_at IS NULL
  JOIN roles r ON r.id=er.role_id AND r.deleted_at IS NULL
  WHERE e.id=${employeeId} AND e.deleted_at IS NULL AND e.account_status='active'
  AND (e.retired_at IS NULL OR e.retired_at>CURRENT_DATE)
  AND (SELECT count(*) FROM employee_roles one_role JOIN roles active_role ON active_role.id=one_role.role_id AND active_role.deleted_at IS NULL WHERE one_role.employee_id=e.id AND one_role.deleted_at IS NULL)=1
  AND (er.scope_type='global' OR (er.scope_type='own_branch' AND r.default_key='branch_administrator'))
  AND (SELECT count(DISTINCT po.operation) FROM role_permissions rp JOIN permissions permission ON permission.id=rp.permission_id AND permission.deleted_at IS NULL
       JOIN permission_operations po ON po.permission_id=permission.id AND po.deleted_at IS NULL
       WHERE rp.role_id=r.id AND rp.deleted_at IS NULL AND rp.scope_type='global' AND po.operation IN ('projects.read','projects.members.manage'))=2
 ) AS eligible`;
 return rows[0].eligible;
}
async function notify(tx:Tx,a:Actor,t:ProjectTicket,type:string,extra:number[]=[]){
 const watchers=await tx.projectWatcher.findMany({where:{ticketId:t.id,deletedAt:null},select:{employeeId:true}});
 const candidates=[...new Set([t.assigneeId,...watchers.map(w=>w.employeeId),...extra].filter((n):n is number=>n!==null&&n!==a.id))];
 const members=await tx.projectMember.findMany({where:{projectId:t.projectId,employeeId:{in:candidates},deletedAt:null},select:{employeeId:true}});
 const people=await tx.employee.findMany({where:{id:{in:members.map(m=>m.employeeId)},...activeEmployee},select:{id:true}});
 await emitNotification(tx,{type,version:1,source:'projects',targetType:'project-ticket',targetKey:String(t.id),deduplicationKey:'project:'+crypto.randomUUID(),recipientIds:people.map(p=>p.id)});
}
async function configuration(tx:Tx,projectId:number){
 const [types,statuses,typeStatuses]=await Promise.all([tx.projectTicketType.findMany({where:{projectId,deletedAt:null},orderBy:[{position:'asc'},{id:'asc'}]}),tx.projectTicketStatus.findMany({where:{projectId,deletedAt:null},orderBy:[{position:'asc'},{id:'asc'}]}),tx.projectTypeStatus.findMany({where:{projectId,deletedAt:null},orderBy:[{position:'asc'},{id:'asc'}]})]);
 return {types,statuses,typeStatuses};
}
export async function detail(tx:Tx,a:Actor,projectId:number){
 const {p,role}=await access(tx,a,projectId),config=await configuration(tx,projectId);
 const members=await tx.projectMember.findMany({where:{projectId,deletedAt:null},include:{employee:{select:personSelect}},orderBy:{id:'asc'}});
 const counts=await tx.projectTicket.groupBy({by:['statusId'],where:{projectId,deletedAt:null},_count:true});
 const minutes=await tx.projectTimeEntry.aggregate({where:{deletedAt:null,ticket:{projectId,deletedAt:null}},_sum:{minutes:true}});
 const estimate=await tx.projectTicket.aggregate({where:{projectId,deletedAt:null},_sum:{estimatedMinutes:true}});
 const engagement=p.engagementId&&a.permissionOperations.includes('engagements.read')?await tx.engagement.findFirst({where:{id:p.engagementId,deletedAt:null},select:{id:true,name:true,code:true,contractStartsOn:true,contractEndsOn:true}}):null;
 const {engagementId:unused,nextTicketNumber:counter,...safe}=p;void unused;void counter;
 return {...safe,role,engagement,...config,members,counts,actualMinutes:minutes._sum.minutes??0,estimatedMinutes:estimate._sum.estimatedMinutes??0,operations:a.permissionOperations.filter(op=>op.startsWith('projects.'))};
}
async function createProject(tx:Tx,a:Actor,b:Body){
 keys(b,['code','name','description','visibility','engagementId']);
 const code=normalizeProjectCode(b.code);if(!code)fail('INVALID_PROJECT_CODE');
 if(await tx.project.findUnique({where:{code},select:{id:true}}))fail('PROJECT_CODE_UNAVAILABLE',409);
 const engagementId=b.engagementId===undefined||b.engagementId===null?null:id(b.engagementId);
 if(engagementId){requireOperationApi(a,'engagements.read');if(!await tx.engagement.findFirst({where:{id:engagementId,deletedAt:null}}))fail('INVALID_ENGAGEMENT');}
 const p=await tx.project.create({data:{code,name:str(b.name,128,false),description:str(b.description??'',5000,true,true),visibility:option(b.visibility??'private',['private','internal']),engagementId}});
 await bindMarkdownImages(tx,a,p.description,{targetType:'project',projectId:p.id,ticketId:null,commentId:null});
 await tx.projectMember.create({data:{projectId:p.id,employeeId:a.id,role:'manager'}});
 const ja=a.displayLanguage==='ja';
 const statuses=[];
 for(const [position,pair] of [['未着手','Open'],['進行中','In progress'],['レビュー中','In review'],['完了','Done'],['中止','Cancelled']].entries())statuses.push(await tx.projectTicketStatus.create({data:{projectId:p.id,name:pair[ja?0:1],position,category:['open','active','active','done','cancelled'][position]}}));
 for(const [position,pair] of [['タスク','Task'],['バグ','Bug'],['ストーリー','Story'],['マイルストーン','Milestone']].entries()){
  const t=await tx.projectTicketType.create({data:{projectId:p.id,name:pair[ja?0:1],position,milestone:position===3}});
  for(const [i,s] of statuses.entries())await tx.projectTypeStatus.create({data:{projectId:p.id,typeId:t.id,statusId:s.id,position:i,initial:i===0}});
 }
 await log(tx,a,p.id,'project.created',{name:p.name,description:p.description});return success(await detail(tx,a,p.id),201);
}
async function ticketRows(tx:Tx,projectId:number,url:URL){
 const q=parseListQuery(url,['id','number','title','position','dueOn','updatedAt'] as const,'position');
 const term=url.searchParams.get('search')??'';if(term.length>500)fail('INVALID_SEARCH');
 const filter:Prisma.ProjectTicketWhereInput={projectId,deletedAt:null,...(term?{OR:[{title:{contains:term,mode:'insensitive'}},{description:{contains:term,mode:'insensitive'}}]}:{})};
 for(const key of ['typeId','statusId','assigneeId'] as const)if(url.searchParams.has(key))filter[key]=id(url.searchParams.get(key));
 if(url.searchParams.has('parentId'))filter.parentId=url.searchParams.get('parentId')==='root'?null:id(url.searchParams.get('parentId'));
 const [total,items,relations,sums]=await Promise.all([tx.projectTicket.count({where:filter}),tx.projectTicket.findMany({where:filter,orderBy:[{[q.sortBy]:q.sortOrder},{id:'asc'}],skip:q.offset,take:q.limit}),tx.projectTicketRelation.findMany({where:{projectId,deletedAt:null,from:{deletedAt:null},to:{deletedAt:null}}}),tx.projectTimeEntry.groupBy({by:['ticketId'],where:{ticket:{projectId,deletedAt:null},deletedAt:null},_sum:{minutes:true}})]);
 const project=await tx.project.findUniqueOrThrow({where:{id:projectId},select:{code:true}});
 const referenceIds=[...items.map(t=>t.parentId),...relations.flatMap(r=>[r.fromId,r.toId])].filter((id):id is number=>id!==null);
 const references=await tx.projectTicket.findMany({where:{projectId,id:{in:[...new Set(referenceIds)]}},select:{id:true,number:true}});
 const codeFor=(id:number|null)=>{const t=references.find(t=>t.id===id);return t?ticketCode(project.code,t.number):null;};
 return success(items.map(t=>({...t,code:ticketCode(project.code,t.number),parentCode:codeFor(t.parentId),actualMinutes:sums.find(s=>s.ticketId===t.id)?._sum.minutes??0})),200,{...listMeta(q,items.length,total),relations:relations.map(r=>({...r,fromCode:codeFor(r.fromId),toCode:codeFor(r.toId)}))});
}
async function ticketDetail(tx:Tx,projectId:number,ticketId:number){
 const t=await tx.projectTicket.findFirst({where:{id:ticketId,projectId,deletedAt:null}});if(!t)missing();
 const [comments,checklists,timeEntries,attachments,watchers]=await Promise.all([
  tx.projectComment.findMany({where:{ticketId,deletedAt:null},include:{author:{select:personSelect}},orderBy:{id:'asc'}}),
  tx.projectChecklist.findMany({where:{ticketId,deletedAt:null},orderBy:[{position:'asc'},{id:'asc'}]}),
  tx.projectTimeEntry.findMany({where:{ticketId,deletedAt:null},include:{employee:{select:personSelect}},orderBy:[{workDate:'desc'},{id:'desc'}]}),
  tx.projectAttachment.findMany({where:{ticketId,deletedAt:null},omit:{content:true},orderBy:{id:'asc'}}),
  tx.projectWatcher.findMany({where:{ticketId,deletedAt:null},select:{employeeId:true}})]);
 const project=await tx.project.findUniqueOrThrow({where:{id:projectId},select:{code:true}});
 const parent=t.parentId?await tx.projectTicket.findFirst({where:{id:t.parentId,projectId},select:{number:true}}):null;
 return {...t,code:ticketCode(project.code,t.number),parentCode:parent?ticketCode(project.code,parent.number):null,comments,checklists,timeEntries,attachments,watchers};
}
async function validTree(tx:Tx,projectId:number,ticketId:number|null,parentId:number|null){
 const rows=await tx.projectTicket.findMany({where:{projectId,deletedAt:null},select:{id:true,parentId:true}}),byId=new Map(rows.map(r=>[r.id,r.parentId]));
 if(parentId&&!byId.has(parentId))fail('INVALID_PARENT');
 if(ticketId)byId.set(ticketId,parentId);
 let current=parentId,depth=1;const seen=new Set<number>(ticketId?[ticketId]:[]);
 while(current!==null){if(seen.has(current))fail('HIERARCHY_CYCLE');seen.add(current);depth++;if(depth>20)fail('HIERARCHY_LIMIT');current=byId.get(current)??null;}
 if(ticketId){let descendants=[ticketId],height=0;while(descendants.length){height++;if(depth+height-1>20)fail('HIERARCHY_LIMIT');const parents=new Set(descendants);descendants=rows.filter(r=>r.id!==ticketId&&r.parentId!==null&&parents.has(r.parentId)).map(r=>r.id);}}
}
async function ticketData(tx:Tx,a:Actor,p:Project,b:Body,old:ProjectTicket|null){
 keys(b,['revision','title','description','parentId','typeId','statusId','assigneeId','priority','startsOn','dueOn','estimatedMinutes','position','labels']);
 const typeId=b.typeId===undefined?old?.typeId:id(b.typeId);if(!typeId)fail('TYPE_REQUIRED');
 const links=await tx.projectTypeStatus.findMany({where:{projectId:p.id,typeId,deletedAt:null,type:{deletedAt:null},status:{deletedAt:null}}});
 const statusId=b.statusId===undefined?old?.statusId??links.find(l=>l.initial)?.statusId:id(b.statusId);
 if(!statusId||!links.some(l=>l.statusId===statusId))fail('STATUS_NOT_ALLOWED_FOR_TYPE');
 const parentId=b.parentId===undefined?old?.parentId??null:b.parentId===null?null:id(b.parentId);
 await validTree(tx,p.id,old?.id??null,parentId);
 const assigneeId=b.assigneeId===undefined?old?.assigneeId??null:b.assigneeId===null?null:id(b.assigneeId);
 if(assigneeId){await employee(tx,assigneeId);if(!await tx.projectMember.findFirst({where:{projectId:p.id,employeeId:assigneeId,deletedAt:null,role:{in:['manager','editor']}}}))fail('ASSIGNEE_MUST_BE_EDITOR');}
 const startsOn=b.startsOn===undefined?old?.startsOn??null:date(b.startsOn),dueOn=b.dueOn===undefined?old?.dueOn??null:date(b.dueOn);if(startsOn&&dueOn&&startsOn>dueOn)fail('INVALID_DATE_RANGE');
 const type=await tx.projectTicketType.findUnique({where:{id:typeId}});if(type?.milestone&&startsOn&&dueOn&&startsOn.getTime()!==dueOn.getTime())fail('MILESTONE_SINGLE_DAY');
 const labels=b.labels===undefined?old?.labels??[]:b.labels;if(!Array.isArray(labels)||labels.length>20||labels.some(x=>typeof x!=='string'||x.length>64))fail('INVALID_LABELS');
 return {title:str(b.title??old?.title,255,false),description:str(b.description??old?.description??'',20000,true,true),typeId,statusId,parentId,assigneeId,priority:option(b.priority??old?.priority??'normal',['low','normal','high','urgent']),startsOn,dueOn,estimatedMinutes:timeMinutes(b.estimatedMinutes===undefined?Number(old?.estimatedMinutes??0):b.estimatedMinutes,0,100000000),position:integer(b.position??old?.position??p.nextTicketNumber-1,0),labels:labels as string[]};
}

export async function projectApi(e:Event){
 const a=requireOperationApi(e.locals.user,'projects.read'),method=e.request.method;
 const path=(e.params.path??'').split('/').filter(Boolean);
 if(!path.length&&method==='GET')return projectList(a,e.url);
 if(path[0]==='directory'&&path.length===1&&method==='GET'){
  if(!allowed(a,'create')&&!allowed(a,'members.manage'))fail('PERMISSION_REQUIRED',403);const q=parseListQuery(e.url,['id','firstName','lastName'] as const,'lastName');const term=e.url.searchParams.get('search')??'';if(term.length>255)fail('INVALID_SEARCH');
  const where={...activeEmployee,...(term?{AND:[{OR:[{firstName:{contains:term,mode:'insensitive' as const}},{lastName:{contains:term,mode:'insensitive' as const}},{employeeCode:{contains:term,mode:'insensitive' as const}}]}]}:{})};
  const [items,total]=await Promise.all([getPrisma().employee.findMany({where,select:personSelect,orderBy:[{[q.sortBy]:q.sortOrder},{id:'asc'}],skip:q.offset,take:q.limit}),getPrisma().employee.count({where})]);return success(items,200,listMeta(q,items.length,total));
 }
 const isUpload=path[3]==='attachments'&&method==='POST';
 let bytes:Uint8Array|undefined,upload:{name:string;mime:string;bytes:Buffer}|undefined;
 if(isUpload){
  requireOperationApi(a,'projects.attachments.manage');
  // Authorize before accepting an attachment body. Recheck inside the write transaction.
  await getPrisma().$transaction(async tx=>access(tx,a,await projectIdentity(tx,path[0]),true));
  const reader=e.request.body?.getReader();if(!reader)fail('INVALID_ATTACHMENT');const parts:Uint8Array[]=[];let size=0;
  try{while(true){const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>11*1024*1024){await reader.cancel();fail('ATTACHMENT_LIMIT',413);}parts.push(r.value);}}finally{reader.releaseLock();}
  bytes=Buffer.concat(parts);const form=await new Response(new Uint8Array(bytes),{headers:{'content-type':e.request.headers.get('content-type')??''}}).formData().catch(()=>fail('INVALID_ATTACHMENT'));
  const file=form.get('file');if(!(file instanceof File)||[...form.keys()].some(k=>k!=='file'))fail('INVALID_ATTACHMENT');upload={name:file.name,mime:file.type,bytes:Buffer.from(await file.arrayBuffer())};
  await validateProjectAttachment(upload);
 }
 const b=method==='GET'||method==='DELETE'||isUpload?{}:await searchBody(e.request);
 return getPrisma().$transaction(async tx=>{
  if(!path.length){if(method!=='POST')fail('METHOD_NOT_ALLOWED',405);requireOperationApi(a,'projects.create');return createProject(tx,a,b);}
  const projectId=await projectIdentity(tx,path[0]);
  if(method!=='GET')await tx.$queryRaw`SELECT id FROM projects WHERE id=${projectId} FOR UPDATE`;
  const {p,role,admin}=await access(tx,a,projectId,method!=='GET',['members','settings'].includes(path[1]??'')||path.length===1&&method!=='GET');
  if(method!=='GET'&&p.status==='archived'&&path.length!==1)fail('PROJECT_ARCHIVED',409);
  if(admin&&role==='manager'&&method!=='GET'&&!await tx.projectMember.findFirst({where:{projectId,employeeId:a.id,role:'manager',deletedAt:null}}))await writeAuditLog(tx,a.id,'project.admin_intervention','projects',projectId);
  if(path.length===1){
   if(method==='GET')return success(await detail(tx,a,projectId));
   if(method==='PATCH'){
    requireOperationApi(a,'projects.update');
    if(Object.hasOwn(b,'code'))fail('PROJECT_CODE_IMMUTABLE');
    keys(b,['revision','name','description','visibility','status','engagementId']);revision(b,p.revision);
    let engagementId=p.engagementId;if(b.engagementId!==undefined){requireOperationApi(a,'engagements.read');engagementId=b.engagementId===null?null:id(b.engagementId);if(engagementId&&!await tx.engagement.findFirst({where:{id:engagementId,deletedAt:null}}))fail('INVALID_ENGAGEMENT');}
    await bindMarkdownImages(tx,a,str(b.description??p.description,5000,true,true),{targetType:'project',projectId,ticketId:null,commentId:null});
    await tx.project.update({where:{id:projectId},data:{name:str(b.name??p.name,128,false),description:str(b.description??p.description,5000,true,true),visibility:option(b.visibility??p.visibility,['private','internal']),status:option(b.status??p.status,['active','on_hold','completed','archived']),engagementId,revision:{increment:1}}});
    await log(tx,a,projectId,'project.updated',{fields:Object.keys(b)});return success(await detail(tx,a,projectId));
   }
   if(method==='DELETE'){requireOperationApi(a,'projects.delete');if(Number(e.url.searchParams.get('revision'))!==p.revision)fail('REVISION_CONFLICT',409);await tx.project.update({where:{id:projectId},data:{deletedAt:new Date(),revision:{increment:1}}});await log(tx,a,projectId,'project.deleted',{});return success(null);}
  }
  if(path[1]==='history'&&path.length===2&&method==='GET'){
   const q=parseListQuery(e.url,['id','createdAt'] as const,'createdAt');const where={projectId,deletedAt:null};const items=await tx.projectHistory.findMany({where,include:{actor:{select:personSelect}},orderBy:[{[q.sortBy]:q.sortOrder},{id:'desc'}],skip:q.offset,take:q.limit});
   const referenceIds=new Set(items.flatMap(h=>h.ticketId===null?[]:[h.ticketId]));
   const collectParents=(value:unknown)=>{if(!value||typeof value!=='object'||Array.isArray(value))return;const row=value as Record<string,unknown>;if(typeof row.parentId==='number')referenceIds.add(row.parentId);for(const key of ['before','after'])collectParents(row[key]);};
   items.forEach(h=>collectParents(h.detail));
   const refs=await tx.projectTicket.findMany({where:{projectId,id:{in:[...referenceIds]}},select:{id:true,number:true}});
   const codeFor=(id:unknown)=>{const t=refs.find(t=>t.id===id);return t?ticketCode(p.code,t.number):null;};
   const displayDetail=(value:unknown):unknown=>{if(!value||typeof value!=='object'||Array.isArray(value))return value;const row={...value as Record<string,unknown>};if('parentId' in row){row.parentCode=codeFor(row.parentId);delete row.parentId;}for(const key of ['before','after'])if(row[key])row[key]=displayDetail(row[key]);return row;};
   return success(items.map(h=>({...h,ticketCode:codeFor(h.ticketId),detail:displayDetail(h.detail)})),200,listMeta(q,items.length,await tx.projectHistory.count({where})));
  }
  if(path[1]==='members'&&path.length<=3&&method!=='GET'){
   requireOperationApi(a,'projects.members.manage');revision(b,p.revision);keys(b,['revision','employeeId','role']);const employeeId=path[2]?id(path[2]):id(b.employeeId);
   if(method==='DELETE')fail('USE_MEMBER_PATCH',405);
   const nextRole=option(b.role,['manager','editor','viewer','removed']);
   if(nextRole!=='removed')await employee(tx,employeeId);
   if(nextRole==='manager'&&!await managerEligible(tx,employeeId))fail('MANAGER_PERMISSION_REQUIRED');
   if(nextRole!=='manager'){
    const others=await tx.projectMember.findMany({where:{projectId,employeeId:{not:employeeId},role:'manager',deletedAt:null},select:{employeeId:true}});let eligible=false;for(const m of others)if(await managerEligible(tx,m.employeeId)){eligible=true;break;}if(!eligible)fail('LAST_PROJECT_MANAGER',409);
    const assigned=await tx.projectTicket.count({where:{projectId,assigneeId:employeeId,deletedAt:null}});if(assigned&&['viewer','removed'].includes(nextRole))fail('MEMBER_HAS_ASSIGNMENTS',409);
   }
   await tx.projectMember.upsert({where:{projectId_employeeId:{projectId,employeeId}},create:{projectId,employeeId,role:nextRole==='removed'?'viewer':nextRole,deletedAt:nextRole==='removed'?new Date():null},update:{role:nextRole==='removed'?'viewer':nextRole,deletedAt:nextRole==='removed'?new Date():null}});
   await tx.project.update({where:{id:projectId},data:{revision:{increment:1}}});await log(tx,a,projectId,'project.member_changed',{employeeId,role:nextRole});return success(await detail(tx,a,projectId));
  }
  if(path[1]==='settings'&&path.length===2&&method==='PUT'){
   requireOperationApi(a,'projects.settings.manage');await saveSettings(tx,a,p,b);return success(await detail(tx,a,projectId));
  }
  if(path[1]!=='tickets')missing();
  if(path.length===2){
   if(method==='GET')return ticketRows(tx,projectId,e.url);
   if(method==='POST'){
    requireOperationApi(a,'projects.tickets.create');if(p.nextTicketNumber>=2147483647)fail('TICKET_NUMBER_EXHAUSTED',409);const data=await ticketData(tx,a,p,b,null);
    const t=await tx.projectTicket.create({data:{...data,projectId,number:p.nextTicketNumber,authorId:a.id}});
    await bindMarkdownImages(tx,a,t.description,{targetType:'ticket',projectId,ticketId:t.id,commentId:null});
    await tx.project.update({where:{id:projectId},data:{nextTicketNumber:{increment:1},revision:{increment:1}}});await log(tx,a,projectId,'ticket.created',{title:t.title,number:t.number,description:t.description},t.id);await notify(tx,a,t,'project.assigned');return success(await ticketDetail(tx,projectId,t.id),201);
   }
   fail('METHOD_NOT_ALLOWED',405);
  }
  const parsed=/^[1-9]\d*$/.test(path[2])?null:parseTicketCode(path[2]);
  if(!/^[1-9]\d*$/.test(path[2])&&(!parsed||parsed.projectCode!==p.code))missing();
  const t=await tx.projectTicket.findFirst({where:{...(/^[1-9]\d*$/.test(path[2])?{id:id(path[2])}:{number:parsed!.number}),projectId,deletedAt:null}});if(!t)missing();const ticketId=t.id;
  if(method==='GET'){
   if(path.length===3)return success(await ticketDetail(tx,projectId,ticketId));
   if(path[3]==='attachments'&&path.length===5){const file=await tx.projectAttachment.findFirst({where:{id:id(path[4]),ticketId,deletedAt:null}});if(!file)missing();return new Response(file.content,{headers:{'content-type':file.mime,'content-disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(file.name),'x-content-type-options':'nosniff','content-security-policy':"sandbox; default-src 'none'",'cache-control':'private, no-store'}});}
   missing();
  }
  const rev=method==='DELETE'||isUpload?Number(e.url.searchParams.get('revision')):b.revision;revision({revision:rev},t.revision);
  let result:unknown=null;let changeDetail:Prisma.InputJsonValue={};const snapshot=(value:unknown)=>JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  if(path.length===3){
   if(method==='PATCH'){requireOperationApi(a,'projects.tickets.update');const data=await ticketData(tx,a,p,b,t);if(data.parentId===t.parentId&&data.position!==t.position){const movingUp=data.position<t.position;await tx.projectTicket.updateMany({where:{projectId,parentId:t.parentId,deletedAt:null,id:{not:ticketId},position:movingUp?{gte:data.position,lt:t.position}:{gt:t.position,lte:data.position}},data:{position:{increment:movingUp?1:-1},revision:{increment:1}}});}await bindMarkdownImages(tx,a,data.description,{targetType:'ticket',projectId,ticketId,commentId:null});const updated=await tx.projectTicket.update({where:{id:ticketId},data});await log(tx,a,projectId,'ticket.updated',{before:JSON.parse(JSON.stringify(t)),after:JSON.parse(JSON.stringify(updated))},ticketId);if(t.assigneeId!==updated.assigneeId)await notify(tx,a,updated,'project.assigned');}
   else if(method==='DELETE'){requireOperationApi(a,'projects.tickets.delete');if(await tx.projectTicket.count({where:{parentId:ticketId,deletedAt:null}}))fail('TICKET_HAS_CHILDREN',409);await tx.projectTicket.update({where:{id:ticketId},data:{deletedAt:new Date()}});await log(tx,a,projectId,'ticket.deleted',{},ticketId);}
   else fail('METHOD_NOT_ALLOWED',405);
  }else if(path[3]==='comments'){
   requireOperationApi(a,'projects.comments.manage');keys(b,['revision','body','mentionIds']);
   if(method==='POST'&&path.length===4){const mentions=b.mentionIds??[];if(!Array.isArray(mentions)||mentions.length>50)fail('INVALID_MENTIONS');const ids=mentions.map(x=>id(x));const count=await tx.projectMember.count({where:{projectId,employeeId:{in:[...new Set(ids)]},deletedAt:null}});if(count!==new Set(ids).size)fail('INVALID_MENTIONS');const comment=await tx.projectComment.create({data:{ticketId,authorId:a.id,body:str(b.body,20000,false,true)}});await bindMarkdownImages(tx,a,comment.body,{targetType:'comment',projectId,ticketId,commentId:comment.id});changeDetail={after:snapshot(comment)};await notify(tx,a,t,'project.comment',ids);}
   else if(path.length===5&&['PATCH','DELETE'].includes(method)){const c=await tx.projectComment.findFirst({where:{id:id(path[4]),ticketId,deletedAt:null}});if(!c)missing();if(c.authorId!==a.id&&role!=='manager')fail('COMMENT_OWNER_REQUIRED',403);if(method==='PATCH')await bindMarkdownImages(tx,a,str(b.body,20000,false,true),{targetType:'comment',projectId,ticketId,commentId:c.id});changeDetail={before:snapshot(c),after:snapshot(await tx.projectComment.update({where:{id:c.id},data:method==='DELETE'?{deletedAt:new Date()}:{body:str(b.body,20000,false,true),revision:{increment:1}}}))};}
   else fail('METHOD_NOT_ALLOWED',405);
  }else if(path[3]==='checklists'){
   requireOperationApi(a,'projects.tickets.update');keys(b,['revision','text','completed','position']);if(b.completed!==undefined&&typeof b.completed!=='boolean')fail('INVALID_CHECKLIST');
   if(method==='POST'&&path.length===4)await tx.projectChecklist.create({data:{ticketId,text:str(b.text,500,false),position:integer(b.position??0,0)}});
   else if(path.length===5&&['PATCH','DELETE'].includes(method)){const c=await tx.projectChecklist.findFirst({where:{id:id(path[4]),ticketId,deletedAt:null}});if(!c)missing();await tx.projectChecklist.update({where:{id:c.id},data:method==='DELETE'?{deletedAt:new Date()}:{text:str(b.text??c.text,500,false),completed:b.completed===undefined?c.completed:b.completed as boolean,position:integer(b.position??c.position,0)}});}
   else fail('METHOD_NOT_ALLOWED',405);
  }else if(path[3]==='time-entries'){
   requireOperationApi(a,'projects.time.manage');keys(b,['revision','workDate','minutes','note']);
   if(method==='POST'&&path.length===4){const workDate=date(b.workDate);if(!workDate)fail('INVALID_DATE');changeDetail={after:snapshot(await tx.projectTimeEntry.create({data:{ticketId,employeeId:a.id,workDate,minutes:timeMinutes(b.minutes,0.01,1440),note:str(b.note??'',2000)}}))};}
   else if(path.length===5&&['PATCH','DELETE'].includes(method)){const c=await tx.projectTimeEntry.findFirst({where:{id:id(path[4]),ticketId,deletedAt:null}});if(!c)missing();if(c.employeeId!==a.id&&role!=='manager')fail('TIME_OWNER_REQUIRED',403);const workDate=b.workDate===undefined?c.workDate:date(b.workDate);if(!workDate)fail('INVALID_DATE');changeDetail={before:snapshot(c),after:snapshot(await tx.projectTimeEntry.update({where:{id:c.id},data:method==='DELETE'?{deletedAt:new Date()}:{minutes:timeMinutes(b.minutes??Number(c.minutes),0.01,1440),workDate,note:str(b.note??c.note,2000),revision:{increment:1}}}))};}
   else fail('METHOD_NOT_ALLOWED',405);
  }else if(path[3]==='watchers'&&path.length===4){
   requireOperationApi(a,'projects.tickets.update');keys(b,['revision','watching']);if(method!=='PUT'||typeof b.watching!=='boolean')fail('INVALID_WATCH');await tx.projectWatcher.upsert({where:{ticketId_employeeId:{ticketId,employeeId:a.id}},create:{ticketId,employeeId:a.id,deletedAt:b.watching?null:new Date()},update:{deletedAt:b.watching?null:new Date()}});
  }else if(path[3]==='relations'){
   requireOperationApi(a,'projects.tickets.update');keys(b,['revision','toId','kind']);
   if(method==='POST'&&path.length===4){
    const toId=id(b.toId),kind=option(b.kind,['relates','blocks','duplicates','finish_start']);if(toId===ticketId||!await tx.projectTicket.findFirst({where:{id:toId,projectId,deletedAt:null}}))fail('INVALID_RELATION');
    if(kind!=='relates'){
     const edges=await tx.projectTicketRelation.findMany({where:{projectId,deletedAt:null,kind:{not:'relates'}}});const seen=new Set<number>(),pending=[toId];while(pending.length){const n=pending.pop()!;if(n===ticketId)fail('DEPENDENCY_CYCLE');if(seen.has(n))continue;seen.add(n);pending.push(...edges.filter(r=>r.fromId===n).map(r=>r.toId));}
    }
    await tx.projectTicketRelation.upsert({where:{fromId_toId_kind:{fromId:ticketId,toId,kind}},create:{projectId,fromId:ticketId,toId,kind},update:{deletedAt:null}});
   }else if(method==='DELETE'&&path.length===5){const r=await tx.projectTicketRelation.findFirst({where:{id:id(path[4]),fromId:ticketId,projectId,deletedAt:null}});if(!r)missing();await tx.projectTicketRelation.update({where:{id:r.id},data:{deletedAt:new Date()}});}
   else fail('METHOD_NOT_ALLOWED',405);
  }else if(path[3]==='attachments'){
   requireOperationApi(a,'projects.attachments.manage');
   if(isUpload&&path.length===4&&upload){
    const totals=await tx.projectAttachment.aggregate({where:{ticketId,deletedAt:null},_count:true,_sum:{size:true}});if(totals._count>=20||(totals._sum.size??0)+upload.bytes.length>50*1024*1024)fail('ATTACHMENT_LIMIT',409);
    await tx.projectAttachment.create({data:{ticketId,uploaderId:a.id,name:upload.name.replace(/[\u0000-\u001f\u007f/\\]/g,'_').slice(0,255),mime:upload.mime,size:upload.bytes.length,content:new Uint8Array(upload.bytes)}});
   }else if(method==='DELETE'&&path.length===5){const file=await tx.projectAttachment.findFirst({where:{id:id(path[4]),ticketId,deletedAt:null}});if(!file)missing();await tx.projectAttachment.update({where:{id:file.id},data:{deletedAt:new Date()}});}
   else fail('METHOD_NOT_ALLOWED',405);
  }else missing();
  await tx.projectTicket.update({where:{id:ticketId},data:{revision:{increment:1}}});await tx.project.update({where:{id:projectId},data:{revision:{increment:1}}});
  if(path.length>3)await log(tx,a,projectId,'ticket.'+path[3]+'.'+method.toLowerCase(),changeDetail,ticketId);
  result=method==='DELETE'&&path.length===3?null:await ticketDetail(tx,projectId,ticketId);return success(result);
 },{timeout:30000}).catch(error=>{if(error instanceof Prisma.PrismaClientKnownRequestError&&error.code==='P2002'&&Array.isArray(error.meta?.target)&&error.meta.target.includes('code'))fail('PROJECT_CODE_UNAVAILABLE',409);if(error instanceof Prisma.PrismaClientKnownRequestError&&['P2002','P2003','P2004','P2034'].includes(error.code))fail('PROJECT_DATA_CONFLICT',409);throw error;});
}

async function saveSettings(tx:Tx,a:Actor,p:Project,b:Body){
 keys(b,['revision','types','statuses','typeStatuses','typeMigrations','statusMigrations']);revision(b,p.revision);
 if(!Array.isArray(b.types)||!Array.isArray(b.statuses)||!Array.isArray(b.typeStatuses)||!b.types.length||b.types.length>30||!b.statuses.length||b.statuses.length>50||b.typeStatuses.length>1500)fail('INVALID_SETTINGS');
 const old=await configuration(tx,p.id),types=new Map<number,number>(),statuses=new Map<number,number>();
 // Negative IDs are local draft references; permanent IDs cannot be forged across projects.
 const parseRow=(v:unknown)=>{if(!v||typeof v!=='object'||Array.isArray(v))fail('INVALID_SETTINGS');return v as Body;};
 const seenTypes=new Set<string>(),seenStatuses=new Set<string>();
 for(const [position,row] of b.types.entries()){
  const r=parseRow(row);keys(r,['id','name','position','milestone']);const key=integer(r.id,-1000000),name=str(r.name,64,false);if(types.has(key)||seenTypes.has(name))fail('DUPLICATE_SETTING');seenTypes.add(name);if(key>=0&&!old.types.some(t=>t.id===key))fail('INVALID_TYPE');if(r.milestone!==undefined&&typeof r.milestone!=='boolean')fail('INVALID_MILESTONE');const milestone=r.milestone===undefined?old.types.find(t=>t.id===key)?.milestone??false:r.milestone as boolean;
  const previous=old.types.find(t=>t.id===key);const type=key<0?await tx.projectTicketType.create({data:{projectId:p.id,name,position,milestone}}):previous&&previous.name===name&&previous.position===position&&previous.milestone===milestone?previous:await tx.projectTicketType.update({where:{id:key},data:{name,position,milestone}});types.set(key,type.id);
 }
 for(const [position,row] of b.statuses.entries()){
  const r=parseRow(row);keys(r,['id','name','category','position']);const key=integer(r.id,-1000000),name=str(r.name,64,false);if(statuses.has(key)||seenStatuses.has(name))fail('DUPLICATE_SETTING');seenStatuses.add(name);if(key>=0&&!old.statuses.some(t=>t.id===key))fail('INVALID_STATUS');
  const data={name,position,category:option(r.category,['open','active','done','cancelled'])};const previous=old.statuses.find(s=>s.id===key);const status=key<0?await tx.projectTicketStatus.create({data:{projectId:p.id,...data}}):previous&&previous.name===data.name&&previous.position===data.position&&previous.category===data.category?previous:await tx.projectTicketStatus.update({where:{id:key},data});statuses.set(key,status.id);
 }
 const links:Array<{typeId:number;statusId:number;position:number;initial:boolean}>=[];
 for(const row of b.typeStatuses){const r=parseRow(row);keys(r,['typeId','statusId','position','initial']);const typeId=types.get(integer(r.typeId,-1000000)),statusId=statuses.get(integer(r.statusId,-1000000));if(!typeId||!statusId||typeof r.initial!=='boolean'||links.some(l=>l.typeId===typeId&&l.statusId===statusId))fail('INVALID_TYPE_STATUSES');links.push({typeId,statusId,position:integer(r.position??links.length,0),initial:r.initial});}
 for(const typeId of types.values()){const ls=links.filter(l=>l.typeId===typeId);if(!ls.length||ls.filter(l=>l.initial).length!==1)fail('INITIAL_STATUS_REQUIRED');const initial=await tx.projectTicketStatus.findUnique({where:{id:ls.find(l=>l.initial)!.statusId}});if(!initial||['done','cancelled'].includes(initial.category))fail('INITIAL_STATUS_MUST_BE_OPEN');}
 const typeMigration=parseRow(b.typeMigrations??{}),statusMigration=parseRow(b.statusMigrations??{});
 const tickets=await tx.projectTicket.findMany({where:{projectId:p.id,deletedAt:null}});
 for(const t of tickets){const mapped=typeMigration[String(t.typeId)];const typeId=types.has(t.typeId)?t.typeId:mapped===undefined?0:types.get(integer(mapped,-1000000));if(!typeId)fail('TYPE_MIGRATION_REQUIRED',409);let statusId=t.statusId;if(!links.some(l=>l.typeId===typeId&&l.statusId===statusId)){const target=statusMigration[t.typeId+':'+t.statusId]??statusMigration[String(t.statusId)];statusId=target===undefined?0:statuses.get(integer(target,-1000000))??0;if(!links.some(l=>l.typeId===typeId&&l.statusId===statusId))fail('STATUS_MIGRATION_REQUIRED',409);}const type=await tx.projectTicketType.findUnique({where:{id:typeId}});if(type?.milestone&&t.startsOn&&t.dueOn&&t.startsOn.getTime()!==t.dueOn.getTime())fail('MILESTONE_SINGLE_DAY');if(typeId!==t.typeId||statusId!==t.statusId){await tx.projectTicket.update({where:{id:t.id},data:{typeId,statusId,revision:{increment:1}}});await log(tx,a,p.id,'ticket.settings_migration',{beforeTypeId:t.typeId,beforeStatusId:t.statusId,typeId,statusId},t.id);}}
 const unchanged=old.typeStatuses.filter(before=>links.some(after=>before.typeId===after.typeId&&before.statusId===after.statusId&&before.position===after.position&&before.initial===after.initial));
 const changedIds=old.typeStatuses.filter(row=>!unchanged.some(same=>same.id===row.id)).map(row=>row.id);
 if(changedIds.length)await tx.projectTypeStatus.updateMany({where:{id:{in:changedIds},projectId:p.id,deletedAt:null},data:{initial:false,deletedAt:new Date()}});
 for(const link of links.filter(row=>!unchanged.some(same=>same.typeId===row.typeId&&same.statusId===row.statusId)))await tx.projectTypeStatus.upsert({where:{typeId_statusId:{typeId:link.typeId,statusId:link.statusId}},create:{projectId:p.id,...link},update:{...link,deletedAt:null}});
 await tx.projectTicketType.updateMany({where:{projectId:p.id,id:{notIn:[...types.values()]},deletedAt:null},data:{deletedAt:new Date()}});
 await tx.projectTicketStatus.updateMany({where:{projectId:p.id,id:{notIn:[...statuses.values()]},deletedAt:null},data:{deletedAt:new Date()}});
 await tx.project.update({where:{id:p.id},data:{revision:{increment:1}}});await log(tx,a,p.id,'project.settings_updated',JSON.parse(JSON.stringify(await configuration(tx,p.id))));
}

export const projectNotificationTypes=['project.assigned','project.comment'];
export async function resolveProjectNotification(key:string,a:Actor){
 if(!/^\d+$/.test(key)||!allowed(a,'read'))return {title:null,href:null,available:false};
 const t=await getPrisma().projectTicket.findFirst({where:{id:Number(key),deletedAt:null,project:{deletedAt:null,OR:administrator(a)?undefined:[{visibility:'internal'},{projectMemberprojectId:{some:{employeeId:a.id,deletedAt:null}}}]}},select:{id:true,title:true,number:true,project:{select:{code:true}}}});
 return t?{title:ticketCode(t.project.code,t.number)+' · '+t.title,href:`/projects/tickets?ticket=${ticketCode(t.project.code,t.number)}`,available:true}:{title:null,href:null,available:false};
}
