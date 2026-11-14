import {createHash} from 'node:crypto';
import {getPrisma} from '#lib/server/prisma.js';
import {Prisma} from '#lib/server/generated/prisma/client.js';
import type {AuthenticatedUser} from '#lib/server/auth/types.js';
import {requireOperationApi,requireSystemAdminApi,writeAuditLog} from '#lib/server/api/admin.js';
import {throwApiError,success} from '#lib/server/api/response.js';
import {hasPermissionOperation,branchGlobalOperations} from '#lib/server/auth/permissions.js';
import {employeeReferenceDate} from '#lib/server/api/employee-derived.js';
import {emitNotification} from '#lib/server/notifications/producer.js';
import {definitionErrors,normalize,attachmentKeys,type Definition,type Values,type WorkflowRoute} from '#lib/workflow-form.js';
import {attachmentType} from './attachment';
type Tx=Prisma.TransactionClient;

const employeeChoiceSelect={
 id:true, firstName:true,lastName:true,middleName:true,
 roleGrants:{where:{deletedAt:null,role:{deletedAt:null}},select:{scopeType:true,role:{select:{defaultKey:true,
  permissions:{where:{deletedAt:null,scopeType:'global',permission:{deletedAt:null}},select:{
   permission:{select:{operations:{where:{deletedAt:null},select:{operation:true}}}}
  }}
 }}}}
} satisfies Prisma.EmployeeSelect;
type EmployeeChoice=Prisma.EmployeeGetPayload<{select:typeof employeeChoiceSelect}>;
function employeeOperations(e:EmployeeChoice):string[]{
 return e.roleGrants.flatMap(g=>g.role.permissions.flatMap(p=>p.permission.operations.filter(o=>g.scopeType==='global'||g.scopeType==='own_branch'&&g.role.defaultKey==='branch_administrator'&&branchGlobalOperations.has(o.operation)).map(o=>o.operation)));
}
function activeEmployeeWhere():Prisma.EmployeeWhereInput {
 return {deletedAt:null,accountStatus:'active',AND:[
  {OR:[{retiredAt:null},{retiredAt:{gt:employeeReferenceDate()}}]},
  {OR:[{deletionScheduledOn:null},{deletionScheduledOn:{gt:employeeReferenceDate()}}]}
 ]};
}

const json=(v:unknown)=>JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
export function bad(code:string,status=422):never {return throwApiError(status,code,code);}
export const fullName=(a:{firstName:string;lastName:string;middleName?:string|null})=>[a.lastName,a.middleName,a.firstName].filter(Boolean).join(' ');
export const admin=(a:AuthenticatedUser)=>hasPermissionOperation(a,'system.manage');
export const object=(v:unknown):Record<string,unknown>=>{if(!v||typeof v!=='object'||Array.isArray(v))bad('INVALID_REQUEST');return v as Record<string,unknown>;};
export const text=(v:unknown,max=160,required=true)=>{if(typeof v!=='string'||v.trim().length>max||required&&!v.trim())bad('INVALID_TEXT');return v.trim();};
export const id=(v:unknown)=>{if(typeof v!=='number'||!Number.isSafeInteger(v)||v<1)bad('INVALID_ID');return v;};
export const key=(v:string)=>{if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v))bad('NOT_FOUND',404);return v;};
export const workflowTypes=['workflow.requested','workflow.approved','workflow.returned','workflow.rejected','workflow.completed','workflow.cancelled','workflow.comment','workflow.reassigned'];
export function workflowRead(a:AuthenticatedUser|null){return requireOperationApi(a,'workflows.read');}
function manage(a:AuthenticatedUser){requireSystemAdminApi(a);requireOperationApi(a,'workflows.templates.manage');}
export const visible=(a:AuthenticatedUser):Prisma.WorkflowRequestWhereInput=>admin(a)?{}:{OR:[{applicantId:a.id},{attempt:{gt:0},steps:{some:{employeeId:a.id,deletedAt:null}}},{attempt:{gt:0},actions:{some:{type:'reassigned',deletedAt:null,detail:{path:['previousEmployeeId'],equals:a.id}}}}]};
export async function lock(tx:Tx,requestKey:string){
 const rows=await tx.$queryRawUnsafe<{id:number}[]>('SELECT id FROM workflow_requests WHERE request_key=$1::uuid AND deleted_at IS NULL FOR UPDATE',key(requestKey));
 if(!rows.length)bad('NOT_FOUND',404);return rows[0].id;
}
export async function requireItem(db:Tx,a:AuthenticatedUser,requestKey:string){
 const item=await db.workflowRequest.findFirst({where:{requestKey:key(requestKey),deletedAt:null,...visible(a)},include:{templateVersion:{include:{template:true}},steps:{where:{deletedAt:null},orderBy:[{attempt:'asc'},{position:'asc'}]}}});if(!item)bad('NOT_FOUND',404);return item;
}
export async function guardRevision(tx:Tx,a:AuthenticatedUser,requestKey:string,revision:unknown){
 await lock(tx,requestKey);const item=await requireItem(tx,a,requestKey);if(item.revision!==revision)bad('CONFLICT',409);return item;
}
export async function directory(a:AuthenticatedUser,approvers=false){
 workflowRead(a);if(approvers)manage(a);
 const employees=await getPrisma().employee.findMany({where:activeEmployeeWhere(),select:employeeChoiceSelect});
 const choices=employees.filter(e=>e.roleGrants.length===1&&(!approvers||['workflows.read','workflows.approve'].every(op=>employeeOperations(e).includes(op)))).map(e=>({id:e.id,name:fullName(e)}));
 const [branches,departments]=await Promise.all([getPrisma().branch.findMany({where:{deletedAt:null},select:{id:true,name:true}}),getPrisma().department.findMany({where:{deletedAt:null},select:{id:true,name:true}})]);
 return {employees:choices,branches,departments};
}
async function route(a:AuthenticatedUser,v:unknown):Promise<WorkflowRoute>{
 if(!Array.isArray(v)||v.length>30)bad('INVALID_ROUTE');
 const ids=v.map(x=>id(object(x).employeeId));if(new Set(ids).size!==ids.length)bad('DUPLICATE_APPROVER');
 const choices=(await directory(a,true)).employees;
 return ids.map(employeeId=>{const e=choices.find(e=>e.id===employeeId);if(!e)bad('APPROVER_UNAVAILABLE');return {employeeId,name:e.name};});
}
export async function validateApprovers(tx:Tx,r:WorkflowRoute,applicantId:number){
 if(!r.length||r.some(e=>e.employeeId===applicantId))bad('SELF_APPROVAL_OR_EMPTY_ROUTE');
 for(const e of r){
  const active=await tx.employee.findFirst({where:{id:e.employeeId,...activeEmployeeWhere()},select:employeeChoiceSelect});
  const grants=active?.roleGrants,ops=active?employeeOperations(active):[];
  if(!active||grants?.length!==1||!ops.includes('workflows.read')||!ops.includes('workflows.approve'))bad('APPROVER_UNAVAILABLE');
 }
}
export async function action(tx:Tx,a:AuthenticatedUser,item:{id:number;attempt:number;currentStep:number},type:string,message='',detail:unknown={}){
 return tx.workflowAction.create({data:{requestId:item.id,actorId:a.id,actorName:fullName(a),attempt:item.attempt,position:item.currentStep,type,message,detail:json(detail)}});
}
export async function notify(tx:Tx,item:{requestKey:string},act:{actionKey:string},type:string,recipients:number[]){
 await emitNotification(tx,{type:'workflow.'+type,version:1,source:'workflow',targetType:'workflow-action',targetKey:act.actionKey,deduplicationKey:'workflow:'+act.actionKey+':'+type,recipientIds:[...new Set(recipients)]});
}
export async function templates(a:AuthenticatedUser,settings=false){
 workflowRead(a);if(settings)manage(a);
 if(settings)return {items:await getPrisma().workflowTemplate.findMany({where:{deletedAt:null},orderBy:{updatedAt:'desc'}})};
 const list=await getPrisma().workflowTemplate.findMany({where:{deletedAt:null,active:true},include:{versions:{orderBy:{version:'desc'},take:1}},orderBy:{name:'asc'}});
 return {items:list.map(t=>{const v=t.versions[0];return v?{id:t.id,templateKey:t.templateKey,name:v.name,description:v.description,versionId:v.id,definition:v.definition,route:v.route}:null;}).filter(Boolean)};
}
// The template row is locked by callers before publishing or creating a request.
async function publishVersion(tx:Tx,a:AuthenticatedUser,t:{id:number;name:string;description:string;definition:Prisma.JsonValue;route:Prisma.JsonValue}){
 const errors=definitionErrors(t.definition);if(errors.length)bad(errors[0]);
 const r=t.route as unknown as WorkflowRoute;if(!r.length)bad('EMPTY_ROUTE');
 const choices=(await directory(a,true)).employees;if(r.some(e=>!choices.some(c=>c.id===e.employeeId)))bad('APPROVER_UNAVAILABLE');
 const latest=await tx.workflowTemplateVersion.aggregate({where:{templateId:t.id},_max:{version:true}}),version=(latest._max.version??0)+1;
 const published=await tx.workflowTemplateVersion.create({data:{templateId:t.id,version,name:t.name,description:t.description,definition:t.definition as Prisma.InputJsonValue,route:t.route as Prisma.InputJsonValue}});
 // Never retarget a request that has ever been submitted, including returned requests.
 const refreshed=await tx.workflowRequest.updateMany({where:{deletedAt:null,status:'draft',attempt:0,submissions:{none:{}},templateVersion:{templateId:t.id}},data:{templateVersionId:published.id,revision:{increment:1}}});
 await writeAuditLog(tx,a.id,'workflow_template_publication','workflow_template',t.id,{version,refreshedDrafts:refreshed.count});
 return {version,id:published.id};
}
export async function saveTemplate(a:AuthenticatedUser,body:unknown,templateKey?:string){
 manage(a);const b=object(body),input=object(b.definition) as unknown as Definition,definition:Definition={version:input.version,fields:input.fields};
 const errors=definitionErrors(definition);if(errors.length)bad(errors[0]);const r=await route(a,b.route);
 return getPrisma().$transaction(async tx=>{
  const data={name:text(b.name),description:text(b.description??'',4000,false),definition:json(definition),route:json(r)};let item;
  if(templateKey){
   await tx.$queryRawUnsafe('SELECT id FROM workflow_templates WHERE template_key=$1::uuid FOR UPDATE',key(templateKey));
   const old=await tx.workflowTemplate.findFirst({where:{templateKey,deletedAt:null}});if(!old)bad('NOT_FOUND',404);if(old.revision!==b.revision)bad('CONFLICT',409);
   item=await tx.workflowTemplate.update({where:{id:old.id},data:{...data,active:old.active&&r.length>0,revision:{increment:1}}});
  }else item=await tx.workflowTemplate.create({data});
  if(item.active){const published=await publishVersion(tx,a,item);item=await tx.workflowTemplate.update({where:{id:item.id},data:{publishedVersion:published.version}});}
  await writeAuditLog(tx,a.id,'workflow_template_save','workflow_template',item.id,{approvalRouteConfigured:r.length>0,active:item.active});return item;
 });
}
export async function templateState(a:AuthenticatedUser,templateKey:string,body:unknown,remove=false){
 manage(a);const b=object(body);
 return getPrisma().$transaction(async tx=>{
  await tx.$queryRawUnsafe('SELECT id FROM workflow_templates WHERE template_key=$1::uuid FOR UPDATE',key(templateKey));
  const t=await tx.workflowTemplate.findFirst({where:{templateKey,deletedAt:null}});if(!t)bad('NOT_FOUND',404);if(t.revision!==b.revision)bad('CONFLICT',409);
  let version=t.publishedVersion;
  if(b.active===true&&!remove)version=(await publishVersion(tx,a,t)).version;
  const item=await tx.workflowTemplate.update({where:{id:t.id},data:{active:!remove&&b.active===true,publishedVersion:version,deletedAt:remove?new Date():null,revision:{increment:1}}});
  if(remove||b.active!==true)await writeAuditLog(tx,a.id,remove?'workflow_template_delete':'workflow_template_publication','workflow_template',item.id);return item;
 });
}
function pagination(url:URL){
 const limit=Number(url.searchParams.get('limit')??100),offset=Number(url.searchParams.get('offset')??0);
 if(!Number.isInteger(limit)||limit<1||limit>500||!Number.isInteger(offset)||offset<0)bad('INVALID_PAGINATION');
 const sortBy=url.searchParams.get('sortBy')??'updatedAt',sortOrder=url.searchParams.get('sortOrder')??'desc';
 if(!['updatedAt','createdAt','title','status'].includes(sortBy)||!['asc','desc'].includes(sortOrder))bad('INVALID_SORT');
 return {limit,offset,orderBy:{[sortBy]:sortOrder} as Prisma.WorkflowRequestOrderByWithRelationInput};
}
export const workflowListSelect={id:true,requestKey:true,title:true,status:true,revision:true,applicantId:true,createdAt:true,updatedAt:true,attempt:true,currentStep:true,applicant:{select:{firstName:true,lastName:true,middleName:true}},templateVersion:{select:{name:true}},steps:{where:{status:'pending',deletedAt:null},select:{employeeName:true}}} satisfies Prisma.WorkflowRequestSelect;
export function workflowListItems(items:Prisma.WorkflowRequestGetPayload<{select:typeof workflowListSelect}>[],a:AuthenticatedUser){return items.map(({applicantId,...i})=>({...i,applicant:fullName(i.applicant),canDelete:i.status==='draft'&&i.attempt===0&&applicantId===a.id&&hasPermissionOperation(a,'workflows.delete')}));}
export async function requests(a:AuthenticatedUser,url:URL){
 workflowRead(a);const {limit,offset,orderBy}=pagination(url),view=url.searchParams.get('view')??'mine';
 if(!['mine','draft','all','pending','related'].includes(view))bad('INVALID_REQUEST');
 const where:Prisma.WorkflowRequestWhereInput={deletedAt:null,...visible(a)};
 if(view==='all'&&!admin(a))bad('FORBIDDEN',403);
 if(view==='mine'||view==='draft')where.applicantId=a.id;
 if(view==='draft')where.status='draft';
 if(view==='pending'){where.status='pending';where.steps={some:{employeeId:a.id,status:'pending',deletedAt:null}};}
 const status=url.searchParams.get('status');if(status){if(!['draft','pending','returned','approved','rejected','cancelled'].includes(status))bad('INVALID_REQUEST');where.status=status;}
 const q=url.searchParams.get('q');if(q)where.title={contains:q.slice(0,160),mode:'insensitive'};
 const templateId=url.searchParams.get('templateId');if(templateId)where.templateVersion={templateId:id(Number(templateId))};
 const from=url.searchParams.get('from'),to=url.searchParams.get('to');
 if(from||to){const valid=(value:string)=>/^\d{4}-\d\d-\d\d$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;if(from&&!valid(from)||to&&!valid(to)||from&&to&&from>to)bad('INVALID_DATE');where.createdAt={...(from?{gte:new Date(from)}:{}),...(to?{lte:new Date(to+'T23:59:59.999Z')}:{})};}
 const db=getPrisma(),[items,total]=await Promise.all([db.workflowRequest.findMany({where,select:workflowListSelect,orderBy,skip:offset,take:limit}),db.workflowRequest.count({where})]);
 return {items:workflowListItems(items,a),total,offset,limit};
}
export async function requestDetail(a:AuthenticatedUser,requestKey:string){
 workflowRead(a);const db=getPrisma(),item=await requireItem(db,a,requestKey);
 const [actions,submissions,attachments]=await Promise.all([db.workflowAction.findMany({where:{requestId:item.id,deletedAt:null},orderBy:{id:'asc'}}),db.workflowSubmission.findMany({where:{requestId:item.id,deletedAt:null},orderBy:{attempt:'asc'}}),db.workflowAttachment.findMany({where:{requestId:item.id,OR:[{deletedAt:null},{submissions:{some:{deletedAt:null}}}]},select:{attachmentKey:true,name:true,mime:true,size:true,deletedAt:true}})]);
 return {...item,actions,submissions,attachments,canManage:admin(a),isApplicant:a.id===item.applicantId};
}
export async function createRequest(a:AuthenticatedUser,body:unknown){
 requireOperationApi(a,'workflows.create');const b=object(body);
 return getPrisma().$transaction(async tx=>{
  const chosen=await tx.workflowTemplateVersion.findFirst({where:{id:id(b.versionId),deletedAt:null},select:{templateId:true}});if(!chosen)bad('TEMPLATE_UNAVAILABLE');
  const locked=await tx.$queryRawUnsafe<{id:number}[]>('SELECT id FROM workflow_templates WHERE id=$1 AND active=true AND deleted_at IS NULL FOR UPDATE',chosen.templateId);if(!locked.length)bad('TEMPLATE_UNAVAILABLE');
  const latest=await tx.workflowTemplateVersion.findFirst({where:{templateId:chosen.templateId,deletedAt:null},orderBy:{version:'desc'}});if(!latest)bad('TEMPLATE_UNAVAILABLE');
  const item=await tx.workflowRequest.create({data:{templateVersionId:latest.id,applicantId:a.id,title:text(b.title??latest.name),values:{}}});
  await writeAuditLog(tx,a.id,'workflow_create','workflow_request',item.id);return {requestKey:item.requestKey};
 });
}
export async function deleteDraft(a:AuthenticatedUser,requestKey:string,body:unknown){
 requireOperationApi(a,'workflows.delete');const b=object(body);
 return getPrisma().$transaction(async tx=>{
  const item=await guardRevision(tx,a,requestKey,b.revision);
  if(item.applicantId!==a.id)bad('FORBIDDEN',403);
  if(item.status!=='draft'||item.attempt!==0||await tx.workflowSubmission.count({where:{requestId:item.id}})||await tx.workflowStep.count({where:{requestId:item.id}}))bad('NOT_DRAFT',409);
  const deletedAt=new Date();
  await tx.workflowAttachment.updateMany({where:{requestId:item.id,deletedAt:null},data:{deletedAt}});
  await tx.workflowAction.updateMany({where:{requestId:item.id,deletedAt:null},data:{deletedAt}});
  await tx.workflowRequest.update({where:{id:item.id},data:{deletedAt,revision:{increment:1}}});
  await writeAuditLog(tx,a.id,'workflow_draft_delete','workflow_request',item.id);
  return {removed:true};
 });
}
export async function updateRequest(a:AuthenticatedUser,requestKey:string,body:unknown){
 requireOperationApi(a,'workflows.update');const b=object(body);
 return getPrisma().$transaction(async tx=>{
 const item=await guardRevision(tx,a,requestKey,b.revision);if(item.applicantId!==a.id||!['draft','returned'].includes(item.status))bad('NOT_EDITABLE',403);
 const currency=text(b.currency,3),values=object(b.values);try{normalize(item.templateVersion.definition as unknown as Definition,values,currency,false);}catch{bad('INVALID_CURRENCY');}
 if(JSON.stringify(values).length>500000)bad('FORM_TOO_LARGE');
 const updated=await tx.workflowRequest.update({where:{id:item.id},data:{title:text(b.title),currency,values:json(values),revision:{increment:1}}});
 await writeAuditLog(tx,a.id,'workflow_update','workflow_request',item.id);return updated;
 });
}
async function validateAttachments(tx:Tx,item:{id:number;definition:Definition},values:Values){
 const keys=attachmentKeys(values,(item as {definition:Definition}).definition.fields);if(keys.length>20)bad('ATTACHMENT_LIMIT');
 const rows=await tx.workflowAttachment.findMany({where:{requestId:item.id,attachmentKey:{in:keys},deletedAt:null},select:{id:true,size:true,mime:true,attachmentKey:true}});
 if(rows.length!==keys.length)bad('INVALID_ATTACHMENT');
 function images(fields:Definition['fields'],v:Values){for(const f of fields){if(f.type==='image'&&Array.isArray(v[f.id])&&(v[f.id] as string[]).some(k=>!rows.find(r=>r.attachmentKey===k)?.mime.startsWith('image/')))bad('INVALID_ATTACHMENT');if(['repeat','table'].includes(f.type)&&Array.isArray(v[f.id]))for(const row of v[f.id] as Values[])images(f.children??[],row);else if(f.children)images(f.children,v);}}
 images(item.definition.fields,values);
 if(rows.reduce((s,r)=>s+r.size,0)>50*1024*1024)bad('ATTACHMENT_LIMIT');return rows;
}
async function selectedDirectory(tx:Tx,definition:Definition,values:Values){
 const selected={employees:new Set<number>(),branches:new Set<number>(),departments:new Set<number>()};
 function walk(fields:Definition['fields'],v:Values){for(const f of fields){
  const area=f.type==='employee'?'employees':f.type==='branch'?'branches':f.type==='department'?'departments':null;
  if(area&&v[f.id])selected[area].add(Number(v[f.id]));
  if(['repeat','table'].includes(f.type)&&Array.isArray(v[f.id]))for(const row of v[f.id] as Values[])walk(f.children??[],row);else if(f.children)walk(f.children,v);
 }}walk(definition.fields,values);
 const [employees,branches,departments]=await Promise.all([
  tx.employee.findMany({where:{id:{in:[...selected.employees]},...activeEmployeeWhere()},select:employeeChoiceSelect}),
  tx.branch.findMany({where:{id:{in:[...selected.branches]},deletedAt:null},select:{id:true,name:true}}),
  tx.department.findMany({where:{id:{in:[...selected.departments]},deletedAt:null},select:{id:true,name:true}})
 ]);
 const valid=employees.filter(e=>e.roleGrants.length===1);
 if(valid.length!==selected.employees.size||branches.length!==selected.branches.size||departments.length!==selected.departments.size)bad('INVALID_OPTION');
 return {employees:valid.map(e=>({id:e.id,name:fullName(e)})),branches,departments};
}
export async function submit(a:AuthenticatedUser,requestKey:string,body:unknown){
 requireOperationApi(a,'workflows.submit');const b=object(body);
 return getPrisma().$transaction(async tx=>{
 const item=await guardRevision(tx,a,requestKey,b.revision);if(item.applicantId!==a.id||!['draft','returned'].includes(item.status))bad('NOT_EDITABLE',403);
 if(item.status==='draft'&&(!item.templateVersion.template.active||item.templateVersion.template.deletedAt))bad('TEMPLATE_UNAVAILABLE');
 const previous=item.steps.filter(s=>s.attempt===item.attempt),r:WorkflowRoute=previous.length?previous.map(s=>({employeeId:s.employeeId,name:s.employeeName})):item.templateVersion.route as unknown as WorkflowRoute;
 await validateApprovers(tx,r,a.id);
 const definition=item.templateVersion.definition as unknown as Definition,result=normalize(definition,object(item.values),item.currency,true);
 if(Object.keys(result.errors).length)throwApiError(422,'FORM_INVALID','Please check the form.',Object.entries(result.errors).map(([field,reason])=>({field,reason})));
 const attachments=await validateAttachments(tx,{id:item.id,definition},result.values),choices=await selectedDirectory(tx,definition,result.values),attempt=item.attempt+1;
 const submission=await tx.workflowSubmission.create({data:{requestId:item.id,attempt,snapshot:json({definition,values:result.values,route:r,title:item.title,currency:item.currency,applicant:{id:a.id,name:fullName(a)},directory:choices})}});
 for(const f of attachments)await tx.workflowSubmissionAttachment.create({data:{submissionId:submission.id,attachmentId:f.id}});
 for(let position=0;position<r.length;position++)await tx.workflowStep.create({data:{requestId:item.id,attempt,position,employeeId:r[position].employeeId,employeeName:r[position].name,status:position===0?'pending':'waiting'}});
 const updated=await tx.workflowRequest.update({where:{id:item.id},data:{attempt,currentStep:0,status:'pending',values:json(result.values),revision:{increment:1}}});
 const act=await action(tx,a,updated,'submitted');await notify(tx,item,act,'requested',[r[0].employeeId]);await writeAuditLog(tx,a.id,'workflow_submit','workflow_request',item.id);return updated;
 });
}
export async function decide(a:AuthenticatedUser,requestKey:string,body:unknown){
 requireOperationApi(a,'workflows.approve');const b=object(body),decision=text(b.decision,20);if(!['approved','returned','rejected'].includes(decision))bad('INVALID_DECISION');
 const message=text(b.message??'',4000,decision!=='approved');
 return getPrisma().$transaction(async tx=>{
 const item=await guardRevision(tx,a,requestKey,b.revision),steps=item.steps.filter(s=>s.attempt===item.attempt),step=steps.find(s=>s.position===item.currentStep);
 if(item.status!=='pending'||!step||step.employeeId!==a.id||step.status!=='pending'||a.id===item.applicantId)bad('NOT_CURRENT_APPROVER',403);
 await tx.workflowStep.update({where:{id:step.id},data:{status:decision}});
 const next=steps.find(s=>s.position===item.currentStep+1),status=decision==='approved'?(next?'pending':'approved'):decision;
 if(decision==='approved'&&next)await tx.workflowStep.update({where:{id:next.id},data:{status:'pending'}});
 if(decision!=='approved')await tx.workflowStep.updateMany({where:{requestId:item.id,attempt:item.attempt,status:{in:['pending','waiting']}},data:{status:'stopped'}});
 const updated=await tx.workflowRequest.update({where:{id:item.id},data:{status,currentStep:decision==='approved'&&next?next.position:item.currentStep,revision:{increment:1}}});
 const act=await action(tx,a,item,decision,message);
 await notify(tx,item,act,decision,[item.applicantId,...(decision==='returned'?steps.filter(s=>s.position<step.position&&s.status==='approved').map(s=>s.employeeId):[])]);
 if(decision==='approved'&&next)await notify(tx,item,act,'requested',[next.employeeId]);
 if(status==='approved')await notify(tx,item,act,'completed',[item.applicantId]);
 await writeAuditLog(tx,a.id,'workflow_'+decision,'workflow_request',item.id,{actionKey:act.actionKey});return updated;
 });
}
export async function comment(a:AuthenticatedUser,requestKey:string,body:unknown){
 requireOperationApi(a,'workflows.comment');const b=object(body),message=text(b.message,4000);
 return getPrisma().$transaction(async tx=>{
 const item=await guardRevision(tx,a,requestKey,b.revision);if(!['pending','returned'].includes(item.status)||item.applicantId!==a.id&&!item.steps.some(s=>s.employeeId===a.id))bad('NOT_COMMENT_PARTICIPANT',403);
 const act=await action(tx,a,item,'comment',message),current=item.steps.find(s=>s.attempt===item.attempt&&s.status==='pending');
 await notify(tx,item,act,'comment',[item.applicantId,...(current?[current.employeeId]:[])].filter(x=>x!==a.id));await tx.workflowRequest.update({where:{id:item.id},data:{revision:{increment:1}}});return {actionKey:act.actionKey};
 });
}
export async function cancel(a:AuthenticatedUser,requestKey:string,body:unknown){
 requireOperationApi(a,'workflows.cancel');const b=object(body);
 return getPrisma().$transaction(async tx=>{
 const item=await guardRevision(tx,a,requestKey,b.revision);if(item.applicantId!==a.id||!['draft','pending','returned'].includes(item.status))bad('NOT_EDITABLE',403);
 await tx.workflowStep.updateMany({where:{requestId:item.id,attempt:item.attempt,status:{in:['pending','waiting']}},data:{status:'stopped'}});
 const updated=await tx.workflowRequest.update({where:{id:item.id},data:{status:'cancelled',revision:{increment:1}}}),act=await action(tx,a,item,'cancelled');
 await notify(tx,item,act,'cancelled',item.steps.filter(s=>s.attempt===item.attempt).map(s=>s.employeeId));await writeAuditLog(tx,a.id,'workflow_cancel','workflow_request',item.id);return updated;
 });
}
export async function reassign(a:AuthenticatedUser,requestKey:string,body:unknown){
 manage(a);const b=object(body),message=text(b.message,4000),employeeId=id(b.employeeId),position=id(Number(b.position)+1)-1;
 return getPrisma().$transaction(async tx=>{
 const item=await guardRevision(tx,a,requestKey,b.revision),steps=item.steps.filter(s=>s.attempt===item.attempt),step=steps.find(s=>s.position===position);
 if(!['pending','returned'].includes(item.status)||!step||step.status==='approved'||steps.some(s=>s.employeeId===employeeId)||employeeId===item.applicantId)bad('INVALID_REASSIGNMENT');
 let available=true;try{await validateApprovers(tx,[{employeeId:step.employeeId,name:step.employeeName}],item.applicantId);}catch{available=false;}
 if(available)bad('APPROVER_STILL_AVAILABLE');await validateApprovers(tx,[{employeeId,name:''}],item.applicantId);
 const employee=await tx.employee.findUniqueOrThrow({where:{id:employeeId},select:{firstName:true,lastName:true,middleName:true}});
 await tx.workflowStep.update({where:{id:step.id},data:{employeeId,employeeName:fullName(employee)}});
 const act=await action(tx,a,item,'reassigned',message,{position,previousEmployeeId:step.employeeId,employeeId});
 await notify(tx,item,act,'reassigned',[item.applicantId,...steps.map(s=>s.employeeId),employeeId]);await tx.workflowRequest.update({where:{id:item.id},data:{revision:{increment:1}}});await writeAuditLog(tx,a.id,'workflow_reassign','workflow_request',item.id);return {actionKey:act.actionKey};
 });
}
const MAX=10*1024*1024;
export async function upload(a:AuthenticatedUser,requestKey:string,request:Request){
 requireOperationApi(a,'workflows.update');if(Number(request.headers.get('content-length')??0)>MAX+100000)bad('ATTACHMENT_LIMIT',413);
 const form=await request.formData().catch(()=>null),file=form?.get('file');if(!(file instanceof File)||file.size<16||file.size>MAX)bad('INVALID_ATTACHMENT');
 const bytes=Buffer.from(await file.arrayBuffer()),mime=attachmentType(bytes);if(!mime||file.type!==mime)bad('INVALID_ATTACHMENT');
 return getPrisma().$transaction(async tx=>{
 const item=await guardRevision(tx,a,requestKey,Number(form?.get('revision')));if(item.applicantId!==a.id||!['draft','returned'].includes(item.status))bad('NOT_EDITABLE',403);
 const existing=await tx.workflowAttachment.aggregate({where:{requestId:item.id,deletedAt:null},_sum:{size:true},_count:true});if(existing._count>=20||(existing._sum.size??0)+file.size>50*1024*1024)bad('ATTACHMENT_LIMIT');
 const f=await tx.workflowAttachment.create({data:{requestId:item.id,name:file.name.replace(/[\u0000-\u001f\u007f/\\]/g,'_').slice(0,200)||'attachment',mime,size:bytes.length,digest:createHash('sha256').update(bytes).digest('hex'),content:bytes}});
 await writeAuditLog(tx,a.id,'workflow_attachment_upload','workflow_request',item.id);return {attachmentKey:f.attachmentKey,name:f.name,mime:f.mime,size:f.size};
 });
}
export async function download(a:AuthenticatedUser,requestKey:string,attachmentKey:string){
 workflowRead(a);const item=await requireItem(getPrisma(),a,requestKey),f=await getPrisma().workflowAttachment.findFirst({where:{requestId:item.id,attachmentKey:key(attachmentKey),OR:[{deletedAt:null},{submissions:{some:{deletedAt:null}}}]}});
 if(!f)bad('NOT_FOUND',404);
 return new Response(new Uint8Array(f.content),{headers:{'content-type':f.mime,'content-disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(f.name),'x-content-type-options':'nosniff','cache-control':'private, no-store','content-security-policy':"sandbox; default-src 'none'"}});
}
export async function removeAttachment(a:AuthenticatedUser,requestKey:string,attachmentKey:string,body:unknown){
 requireOperationApi(a,'workflows.update');const b=object(body);
 return getPrisma().$transaction(async tx=>{
 const item=await guardRevision(tx,a,requestKey,b.revision);if(item.applicantId!==a.id||!['draft','returned'].includes(item.status))bad('NOT_EDITABLE',403);
 const f=await tx.workflowAttachment.findFirst({where:{requestId:item.id,attachmentKey:key(attachmentKey),deletedAt:null}});if(!f)bad('NOT_FOUND',404);
 await tx.workflowAttachment.update({where:{id:f.id},data:{deletedAt:new Date()}});return {removed:true};
 });
}
export async function resolveWorkflowNotification(actionKey:string,a:AuthenticatedUser){
 if(!hasPermissionOperation(a,'workflows.read'))return {title:null,href:null,available:false};
 if(!/^[0-9a-f-]{36}$/i.test(actionKey))return {title:null,href:null,available:false};
 const act=await getPrisma().workflowAction.findFirst({where:{actionKey,deletedAt:null,request:{deletedAt:null,...visible(a)}},select:{actionKey:true,request:{select:{requestKey:true,title:true}}}});
 if(!act)return {title:null,href:null,available:false};return {title:act.request.title,href:'/workflows?request='+act.request.requestKey+'&action='+act.actionKey,available:true};
}
export async function workflowEndpoint(a:AuthenticatedUser|null,request:Request,url:URL,area:'templates'|'requests',path=''):Promise<Response>{
 const actor=workflowRead(a),parts=path.split('/').filter(Boolean),method=request.method,body=()=>request.json().catch(()=>bad('INVALID_REQUEST'));
 if(area==='templates'){
  if(!parts.length&&method==='GET')return success(await templates(actor,url.searchParams.get('settings')==='true'));
  if(!parts.length&&method==='POST')return success(await saveTemplate(actor,await body()),201);
  if(parts.length===1&&method==='PATCH')return success(await saveTemplate(actor,await body(),parts[0]));
  if(parts.length===1&&method==='DELETE')return success(await templateState(actor,parts[0],await body(),true));
  if(parts.length===2&&parts[1]==='publication'&&method==='PUT')return success(await templateState(actor,parts[0],await body()));
 }else{
  if(!parts.length&&method==='GET')return success(await requests(actor,url));
  if(!parts.length&&method==='POST')return success(await createRequest(actor,await body()),201);
  if(parts.length===1&&parts[0]==='directory'&&method==='GET')return success(await directory(actor,url.searchParams.get('approvers')==='true'));
  if(parts.length===1&&method==='GET')return success(await requestDetail(actor,parts[0]));
  if(parts.length===1&&method==='PATCH')return success(await updateRequest(actor,parts[0],await body()));
  if(parts.length===1&&method==='DELETE')return success(await deleteDraft(actor,parts[0],await body()));
  if(parts.length===2&&method==='POST'){
   const routes={submissions:submit,decisions:decide,comments:comment,cancellations:cancel,'route-changes':reassign};
   const fn=routes[parts[1] as keyof typeof routes];if(fn)return success(await fn(actor,parts[0],await body()),201);
   if(parts[1]==='attachments')return success(await upload(actor,parts[0],request),201);
  }
  if(parts.length===3&&parts[1]==='attachments'){
   if(method==='GET')return download(actor,parts[0],parts[2]);
   if(method==='DELETE')return success(await removeAttachment(actor,parts[0],parts[2],await body()));
  }
 }
 bad('NOT_FOUND',404);
}
