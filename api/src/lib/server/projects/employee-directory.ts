import {Prisma} from '#lib/server/generated/prisma/client.js';
import {getPrisma} from '../prisma';
import {throwApiError} from '../api/response';
import {parseListQuery,listMeta} from '../api/query';
import {projectSuccess} from './time';
import {access} from './service';
import {requireOperationApi} from '../api/admin';
import type {AuthenticatedUser} from '../auth/types';
import type {SearchDefinition} from '../api/search-conditions';

// Project participation is independent of login provisioning. Managers and
// notification recipients still require their existing active-account checks.
export const projectEmployeeWhere=():Prisma.EmployeeWhereInput=>({deletedAt:null,accountStatus:{in:['active','unprovisioned']},OR:[{retiredAt:null},{retiredAt:{gt:new Date()}}]});

export async function projectEmployeeDirectory(url:URL){
 const q=parseListQuery(url,['id','firstName','lastName'] as const,'lastName');
 const term=(url.searchParams.get('search')??'').trim();if(term.length>255)throwApiError(422,'INVALID_SEARCH','Search is too long.');
 const pattern=(value:string)=>'%'+value.replace(/[\\%_]/g,c=>'\\'+c)+'%';
 const words=term.split(/[\s　]+/).filter(Boolean),compact=pattern(words.join(''));
 const tokens=words.map(word=>Prisma.sql`(e.first_name ILIKE ${pattern(word)} OR e.last_name ILIKE ${pattern(word)} OR e.employee_code ILIKE ${pattern(word)})`);
 const nameMatch=Prisma.sql`(regexp_replace(e.last_name||e.first_name,'[[:space:]　]+','','g') ILIKE ${compact} OR regexp_replace(e.first_name||e.last_name,'[[:space:]　]+','','g') ILIKE ${compact})`;
 const where=Prisma.sql`e.deleted_at IS NULL AND e.account_status IN ('active','unprovisioned') AND (e.retired_at IS NULL OR e.retired_at>CURRENT_DATE) AND ${words.length?Prisma.sql`(${Prisma.join(tokens,' AND ')} OR ${nameMatch})`:Prisma.sql`true`}`;
 const order={id:'e.id',firstName:'e.first_name',lastName:'e.last_name'}[q.sortBy];
 return getPrisma().$transaction(async tx=>{
  const [total]=await tx.$queryRaw<{count:number}[]>(Prisma.sql`SELECT count(*)::int count FROM employees e WHERE ${where}`);
  const items=await tx.$queryRaw<Array<{id:number;employeeCode:string;firstName:string;lastName:string}>>(Prisma.sql`SELECT e.id,e.employee_code AS "employeeCode",e.first_name AS "firstName",e.last_name AS "lastName" FROM employees e WHERE ${where} ORDER BY ${Prisma.raw(order)} ${q.sortOrder==='asc'?Prisma.sql`ASC`:Prisma.sql`DESC`},e.id OFFSET ${q.offset} LIMIT ${q.limit}`);
  return projectSuccess(items,200,listMeta(q,items.length,total.count));
 },{isolationLevel:'RepeatableRead'});
}

export async function authorizeMemberSearch(actor:AuthenticatedUser,url:URL){
 const raw=url.searchParams.get('projectId'),view=url.searchParams.get('view')??'members';
 if(!raw||!/^\d+$/.test(raw)||!Number.isSafeInteger(Number(raw))||Number(raw)<1||!['members','candidates'].includes(view))throwApiError(422,'INVALID_SEARCH_CONDITION','Invalid project or view.');
 if(view==='candidates')requireOperationApi({...actor,activeOperation:undefined},'projects.members.manage');
 return getPrisma().$transaction(async tx=>{
  const result=await access(tx,actor,Number(raw),view==='candidates',view==='candidates');
  if(view==='candidates'&&result.p.status==='archived')throwApiError(409,'PROJECT_ARCHIVED','Archived projects are read only.');
  return {projectId:Number(raw),view};
 });
}
export async function projectMemberResults(actor:AuthenticatedUser,definition:SearchDefinition,conditions:Prisma.Sql,url:URL,offset:number){
 const {projectId,view}=await authorizeMemberSearch(actor,url);
 const pattern=(value:string)=>'%'+value.replace(/[\\%_]/g,c=>'\\'+c)+'%';
 const words=definition.keyword.trim().split(/[\s　]+/).filter(Boolean),compact=pattern(words.join(''));
 const tokens=words.map(word=>Prisma.sql`(employee.first_name ILIKE ${pattern(word)} OR employee.last_name ILIKE ${pattern(word)} OR employee.employee_code ILIKE ${pattern(word)})`);
 const keyword=words.length?Prisma.sql`(${Prisma.join(tokens,' AND ')} OR regexp_replace(employee.last_name||employee.first_name,'[[:space:]　]+','','g') ILIKE ${compact} OR regexp_replace(employee.first_name||employee.last_name,'[[:space:]　]+','','g') ILIKE ${compact})`:Prisma.sql`true`;
 const membership=Prisma.sql`EXISTS(SELECT 1 FROM project_members m WHERE m.project_id=${projectId} AND m.employee_id=employee.id AND m.deleted_at IS NULL)`;
 const eligible=Prisma.sql`employee.account_status IN ('active','unprovisioned') AND (employee.retired_at IS NULL OR employee.retired_at>CURRENT_DATE)`;
 const where=Prisma.sql`employee.deleted_at IS NULL AND ${view==='members'?membership:Prisma.sql`NOT (${membership}) AND ${eligible}`} AND (${conditions}) AND ${keyword}`;
 const order:Record<string,string>={employeeCode:'employee.employee_code',firstName:'employee.first_name',lastName:'employee.last_name'};
 return getPrisma().$transaction(async tx=>{
  // Recheck access and membership in the same snapshot used for the result.
  const current=await access(tx,actor,projectId,view==='candidates',view==='candidates');
  if(view==='candidates'&&current.p.status==='archived')throwApiError(409,'PROJECT_ARCHIVED','Archived projects are read only.');
  const [total]=await tx.$queryRaw<{count:number}[]>(Prisma.sql`SELECT count(*)::int count FROM employees employee WHERE ${where}`);
  const rows=await tx.$queryRaw<Array<{id:number;employeeCode:string;firstName:string;lastName:string}>>(Prisma.sql`SELECT employee.id,employee.employee_code AS "employeeCode",employee.first_name AS "firstName",employee.last_name AS "lastName" FROM employees employee WHERE ${where} ORDER BY ${Prisma.raw(order[definition.sortBy])} ${definition.sortOrder==='asc'?Prisma.sql`ASC`:Prisma.sql`DESC`},employee.id OFFSET ${offset} LIMIT ${definition.limit}`);
  return projectSuccess(rows,200,{total:total.count,offset,limit:definition.limit});
 },{isolationLevel:'RepeatableRead'});
}
