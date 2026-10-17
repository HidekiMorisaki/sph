import { readMasterSnapshot, recordMasterChange } from './master-history';
import { Prisma } from '$lib/server/generated/prisma/client';
import type { AuthenticatedUser } from '$lib/server/auth/types';
import { hasScopedPermissionOperation } from '$lib/server/auth/permissions';
import { requireOperationApi, writeAuditLog } from './admin';
import { requireBranchAccess, requireScopedOperationApi } from './branch-access';
import { parseId } from './database';
import { employeeReferenceDate } from './employee-derived';
import { listMeta, parseListQuery, parseSearch } from './query';
import { failure, success, throwApiError } from './response';
import { getPrisma } from '$lib/server/prisma';

export type MasterKind = 'skills' | 'projects';
export type RecordKind = 'skills' | 'participations';
type Event = { locals: { user: AuthenticatedUser | null }; params: Record<string,string | undefined>; request: Request; url: URL };
const masterSelect = { id:true, name:true, description:true, createdAt:true, updatedAt:true } as const;
const skillSelect = { ...masterSelect, category:true } as const;
const projectSelect = {...masterSelect,clientId:true,contractStartsOn:true,contractEndsOn:true,client:{select:{id:true,name:true,companyName:true}}} as const;
const skillRecordSelect = { id:true, employeeId:true, skillId:true, proficiency:true, experienceYears:true, notes:true, createdAt:true, updatedAt:true, skill:{select:skillSelect} } as const;
const participationSelect = { id:true, employeeId:true, projectId:true, startsOn:true, endsOn:true, responsibility:true, createdAt:true, updatedAt:true, project:{select:projectSelect} } as const;

function invalid(field: string): never { throwApiError(422,'VALIDATION_ERROR','One or more fields are invalid.',[{field,reason:'INVALID_VALUE'}]); }
function object(value: unknown) { if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('body'); return value as Record<string,unknown>; }
function text(body: Record<string,unknown>, key: string, max: number, required = false) {
 const value = body[key];
 if (value == null && !required) return null;
 if (typeof value !== 'string') invalid(key);
 const result = value.trim();
 if ((required && !result) || result.length > max) invalid(key);
 return result || null;
}
function positive(value: unknown, field: string): number { if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) invalid(field); return value; }
function date(value: unknown, field: string, optional = false): Date | null {
 if ((value == null || value === '') && optional) return null;
 if (typeof value !== 'string' || !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value)) invalid(field);
 const result = new Date(value + 'T00:00:00Z');
 if (!Number.isFinite(result.getTime()) || result.toISOString().slice(0,10) !== value) invalid(field);
 return result;
}
async function conflict<T>(work: () => Promise<T>) {
 try { return await work(); } catch(error) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
   if (error.code === 'P2002') return failure(409,'DUPLICATE_VALUE','This value is already in use, including retained records.');
   if (error.code === 'P2034') return failure(409,'CONCURRENT_CHANGE','Reload and try again.');
  }
  throw error;
 }
}

export async function workforceMaster(event: Event, kind: MasterKind) {
 const { locals, params, request, url } = event;
 const method = request.method;
 const operation = kind + '.' + ({GET:'read',POST:'create',PATCH:'update',DELETE:'delete'}[method] ?? 'invalid');
 const actor = requireOperationApi(locals.user,operation);
 requireOperationApi(actor,kind+'.read');
 const id = params.id === undefined ? null : parseId(params.id);
 if (params.id !== undefined && !id) return failure(404,'NOT_FOUND','Not found.');
 const db = getPrisma();
 if (method === 'GET' && !id) {
  const query = parseListQuery(url, kind === 'skills' ? ['name','category','description','createdAt','updatedAt'] as const : ['name','description','contractStartsOn','contractEndsOn','createdAt','updatedAt'] as const,'name');
  const search = parseSearch(url);
  const contains = {contains:search,mode:'insensitive' as const};
  const where = {deletedAt:null,OR:[{name:contains},{description:contains},...(kind==='skills'?[{category:contains}]:[])]};
  const result = await db.$transaction(async tx => {
   const orderBy = [{[query.sortBy]:query.sortOrder},{id:'asc' as const}];
   const args = {where,orderBy,skip:query.offset,take:query.limit};
   return kind==='skills' ? {total:await tx.skill.count({where}),items:await tx.skill.findMany({...args,select:skillSelect})}
    : {total:await tx.project.count({where}),items:await tx.project.findMany({...args,select:projectSelect})};
  },{isolationLevel:'RepeatableRead'});
  return success(result.items,200,listMeta(query,result.items.length,result.total));
 }
 if (method === 'GET') {
  const item = kind==='skills' ? await db.skill.findFirst({where:{id:id!,deletedAt:null},select:skillSelect}) : await db.project.findFirst({where:{id:id!,deletedAt:null},select:projectSelect});
  return item ? success(item) : failure(404,'NOT_FOUND','Not found.');
 }
 const body = method==='DELETE' ? {} : object(await request.json().catch(()=>null));
 const name = method==='DELETE' ? '' : text(body,'name',128,true)!;
 const description = method==='DELETE' ? null : text(body,'description',5000);
 const clientId = kind==='projects' && method!=='DELETE' ? positive(body.clientId,'clientId') : null;
 const contractStartsOn = kind==='projects' && method!=='DELETE' ? date(body.contractStartsOn,'contractStartsOn') : null;
 const contractEndsOn = kind==='projects' && method!=='DELETE' ? date(body.contractEndsOn,'contractEndsOn',true) : null;
 if(contractEndsOn && contractStartsOn && contractEndsOn < contractStartsOn) invalid('contractEndsOn');
 const category = kind==='skills' && method!=='DELETE' ? text(body,'category',128) : null;
 if (kind==='projects' && Object.hasOwn(body,'code')) invalid('code');
 return conflict(()=>db.$transaction(async tx => {
  const before = id ? kind==='skills' ? await tx.skill.findFirst({where:{id,deletedAt:null},select:skillSelect}) : await tx.project.findFirst({where:{id,deletedAt:null},select:projectSelect}) : null;
  const historyBefore = kind==='projects' && id ? await readMasterSnapshot(tx,'projects',id) : null;
  if(clientId && !await tx.client.count({where:{id:clientId,deletedAt:null}})) invalid('clientId');
  if (id && !before) throwApiError(404,'NOT_FOUND','Not found.');
  if (method==='DELETE') {
   const count = kind==='skills' ? await tx.employeeSkill.count({where:{skillId:id!,deletedAt:null,employee:{deletedAt:null}}}) : await tx.projectParticipation.count({where:{projectId:id!,deletedAt:null,employee:{deletedAt:null}}});
   if (count) return failure(409,'RESOURCE_IN_USE','Remove the employee records before deleting this master.');
   if (kind==='skills') await tx.skill.update({where:{id:id!},data:{deletedAt:new Date()}});
   else await tx.project.update({where:{id:id!},data:{deletedAt:new Date()}});
   if(kind==='projects') await recordMasterChange(tx,'projects',id!,actor.id,'delete',historyBefore,null);
   await writeAuditLog(tx,actor.id,'delete',kind,id!,{before});
   return success({id,deleted:true});
  }
  const item = kind==='skills'
   ? id ? await tx.skill.update({where:{id},data:{name,nameKey:name.toLowerCase(),category,description},select:skillSelect}) : await tx.skill.create({data:{name,nameKey:name.toLowerCase(),category,description},select:skillSelect})
   : id ? await tx.project.update({where:{id},data:{name,description,clientId,contractStartsOn,contractEndsOn},select:projectSelect}) : await tx.project.create({data:{name,description,clientId,contractStartsOn,contractEndsOn},select:projectSelect});
  if(kind==='projects') await recordMasterChange(tx,'projects',item.id,actor.id,id?'update':'create',historyBefore,await readMasterSnapshot(tx,'projects',item.id));
  await writeAuditLog(tx,actor.id,id?'update':'create',kind,item.id,{before,after:item});
  return success(item,id?200:201);
 },{isolationLevel:'Serializable'}));
}

async function employeeAccess(tx: Prisma.TransactionClient, user: AuthenticatedUser | null, employeeId: number, operation = 'employees.read') {
 if (!user) throwApiError(401,'AUTHENTICATION_REQUIRED','Authentication is required.');
 requireScopedOperationApi(user,'employees.read');
 requireScopedOperationApi(user,operation);
 const employee = await tx.employee.findFirst({where:{id:employeeId,deletedAt:null},select:{branchId:true}});
 if (!employee) throwApiError(404,'NOT_FOUND','Not found.');
 requireBranchAccess(user,'employees.read',employee.branchId);
 requireBranchAccess(user,operation,employee.branchId);
 return user;
}
function recordOutput(item: {startsOn?:Date;endsOn?:Date|null;experienceYears?:Prisma.Decimal|null} & Record<string,unknown>) {
 return {...item,...('experienceYears' in item ? {experienceYears:item.experienceYears?.toNumber() ?? null} : {}),
  ...('startsOn' in item ? {participationStatus: item.startsOn! > employeeReferenceDate() ? 'planned' : item.endsOn && item.endsOn < employeeReferenceDate() ? 'ended' : 'active'} : {})};
}
function historySnapshot(item: Record<string,unknown> | null): Record<string,unknown> {
 if (!item) return {};
 const result = {...item}; delete result.id; delete result.employeeId; delete result.createdAt; delete result.updatedAt; delete result.skillId; delete result.projectId;
 if (item.skill) { result.skill = (item.skill as {name:string}).name; result.experienceYears = item.experienceYears == null ? null : String(item.experienceYears); }
 if (item.project) result.project = (item.project as {name:string}).name;
 for (const [key,value] of Object.entries(result)) result[key] = value instanceof Date ? value.toISOString().slice(0,10) : value == null ? null : String(value);
 return result;
}

export async function workforceRecords(event: Event, kind: RecordKind) {
 const {locals,params,request,url} = event;
 const employeeId = parseId(params.id ?? '');
 const recordId = params.recordId === undefined ? null : parseId(params.recordId);
 if (!employeeId || (params.recordId !== undefined && !recordId)) return failure(404,'NOT_FOUND','Not found.');
 const method = request.method;
 const operation = method==='GET' ? 'employees.read' : 'employees.'+kind+'.'+({POST:'create',PATCH:'update',DELETE:'delete'}[method] ?? 'invalid');
 // Deny before looking up references or processing input.
 if (!locals.user) throwApiError(401,'AUTHENTICATION_REQUIRED','Authentication is required.');
 if (!locals.user.permissionOperations.includes(operation) && !locals.user.ownBranchPermissionOperations.includes(operation)) throwApiError(403,'PERMISSION_REQUIRED','Permission is required.');
 const body = method==='GET' || method==='DELETE' ? {} : object(await request.json().catch(()=>null));
 return conflict(()=>getPrisma().$transaction(async tx => {
  const actor = await employeeAccess(tx,locals.user,employeeId,operation);
  if (method==='GET') {
   const query = parseListQuery(url,kind==='skills'?['proficiency','experienceYears','createdAt','updatedAt'] as const:['startsOn','endsOn','createdAt','updatedAt'] as const,kind==='skills'?'createdAt':'startsOn');
   const where = {employeeId,deletedAt:null};
   const args = {where,orderBy:[{[query.sortBy]:query.sortOrder},{id:'asc' as const}],skip:query.offset,take:query.limit};
   const items = kind==='skills' ? await tx.employeeSkill.findMany({...args,select:skillRecordSelect}) : await tx.projectParticipation.findMany({...args,select:participationSelect});
   const total = kind==='skills'?await tx.employeeSkill.count({where}):await tx.projectParticipation.count({where});
   const employee = await tx.employee.findUniqueOrThrow({where:{id:employeeId},select:{branchId:true}});
   const editable = Object.fromEntries(['create','update','delete'].map(action=>[action,hasScopedPermissionOperation(actor,'employees.'+kind+'.'+action,employee.branchId)]));
   return success(items.map(item=>recordOutput(item)),200,{...listMeta(query,items.length,total),editable});
  }
  const before = recordId ? kind==='skills'
   ? await tx.employeeSkill.findFirst({where:{id:recordId,employeeId,deletedAt:null},select:skillRecordSelect})
   : await tx.projectParticipation.findFirst({where:{id:recordId,employeeId,deletedAt:null},select:participationSelect}) : null;
  if (recordId && !before) throwApiError(404,'NOT_FOUND','Not found.');
  let item;
  if (method==='DELETE') {
   item = kind==='skills' ? await tx.employeeSkill.update({where:{id:recordId!},data:{deletedAt:new Date()},select:skillRecordSelect})
    : await tx.projectParticipation.update({where:{id:recordId!},data:{deletedAt:new Date()},select:participationSelect});
  } else if (kind==='skills') {
   const skillId = positive(body.skillId,'skillId');
   if (before && 'skillId' in before && before.skillId !== skillId) invalid('skillId');
   if (!await tx.skill.findFirst({where:{id:skillId,deletedAt:null},select:{id:true}})) invalid('skillId');
   const proficiency = positive(body.proficiency,'proficiency'); if (proficiency>3) invalid('proficiency');
   const experienceYears = body.experienceYears == null || body.experienceYears === '' ? null : body.experienceYears;
   if (experienceYears !== null && (typeof experienceYears !== 'number' || !Number.isFinite(experienceYears) || experienceYears<0 || experienceYears>80 || Math.abs(experienceYears*10-Math.round(experienceYears*10))>1e-8)) invalid('experienceYears');
   const data = {employeeId,skillId,proficiency,experienceYears:experienceYears as number|null,notes:text(body,'notes',5000)};
   if (!recordId && await tx.employeeSkill.findFirst({where:{employeeId,skillId,deletedAt:null},select:{id:true}})) return failure(409,'DUPLICATE_VALUE','This employee already has this skill.');
   item = recordId ? await tx.employeeSkill.update({where:{id:recordId},data,select:skillRecordSelect})
    : await tx.employeeSkill.upsert({where:{employeeId_skillId:{employeeId,skillId}},create:data,update:{...data,deletedAt:null},select:skillRecordSelect});
  } else {
   const projectId = positive(body.projectId,'projectId');
   if (before && 'projectId' in before && before.projectId !== projectId) invalid('projectId');
   if (!await tx.project.findFirst({where:{id:projectId,deletedAt:null},select:{id:true}})) invalid('projectId');
   const startsOn = date(body.startsOn,'startsOn')!, endsOn = date(body.endsOn,'endsOn',true);
   if (endsOn && endsOn<startsOn) invalid('endsOn');
   const overlap = await tx.projectParticipation.findFirst({where:{employeeId,projectId,deletedAt:null,...(recordId?{id:{not:recordId}}:{}),
    ...(endsOn?{startsOn:{lte:endsOn}}:{}),OR:[{endsOn:null},{endsOn:{gte:startsOn}}]},select:{id:true}});
   if (overlap) return failure(409,'PERIOD_OVERLAP','Participation periods for the same employee and project must not overlap.');
   const data = {employeeId,projectId,startsOn,endsOn,responsibility:text(body,'responsibility',5000)};
   item = recordId ? await tx.projectParticipation.update({where:{id:recordId},data,select:participationSelect})
    : await tx.projectParticipation.create({data,select:participationSelect});
  }
  const action = method==='POST'?'create':method==='DELETE'?'delete':'update';
  const old = historySnapshot(before), next = method==='DELETE'?{}:historySnapshot(item);
  const changes = [...new Set([...Object.keys(old),...Object.keys(next)])].filter(field=>JSON.stringify(old[field])!==JSON.stringify(next[field])).map(field=>({field,before:old[field]??null,after:next[field]??null}));
  if (changes.length) {
   const subject = kind==='skills'?'skill':'project';
   if (!changes.some(change=>change.field===subject)) changes.unshift({field:subject,before:old[subject]??null,after:next[subject]??null});
   await tx.workforceChangeHistory.create({data:{employeeId,actorId:actor.id,resource:kind,resourceId:item.id,action,changes:changes as Prisma.InputJsonValue}});
   await writeAuditLog(tx,actor.id,action,'employee_'+kind,item.id,{employeeId,changes});
  }
  return success(method==='DELETE'?{id:item.id,deleted:true}:recordOutput(item),method==='POST'?201:200);
 },{isolationLevel:'Serializable'}));
}

export async function workforceHistory(event: Event) {
 if (!event.locals.user) throwApiError(401,'AUTHENTICATION_REQUIRED','Authentication is required.');
 const employeeId = parseId(event.params.id ?? '');
 if (!employeeId) return failure(404,'NOT_FOUND','Not found.');
 const query = parseListQuery(event.url,['createdAt'] as const,'createdAt');
 return getPrisma().$transaction(async tx => {
  await employeeAccess(tx,event.locals.user,employeeId);
  const where = {employeeId,deletedAt:null};
  const items = await tx.workforceChangeHistory.findMany({where,select:{id:true,resource:true,resourceId:true,action:true,changes:true,createdAt:true,
   actor:{select:{id:true,firstName:true,middleName:true,lastName:true}}},orderBy:[{createdAt:query.sortOrder},{id:query.sortOrder}],skip:query.offset,take:query.limit});
  return success(items.map(({createdAt,...item})=>({...item,changedAt:createdAt})),200,listMeta(query,items.length,await tx.workforceChangeHistory.count({where})));
 },{isolationLevel:'RepeatableRead'});
}
