import {Prisma} from '$lib/server/generated/prisma/client';
import {getPrisma} from '$lib/server/prisma';
import type {AuthenticatedUser} from '$lib/server/auth/types';
import {requireOperationApi} from '../api/admin';
import {throwApiError} from '../api/response';
import {projectSuccess as success} from './time';
import type {SearchDefinition} from '../api/search-conditions';
import {ticketCode,ticketCodeExpression} from './codes';
import {projectVisibility,detail} from './service';

export async function ticketReferenceOptions(table:string,user:AuthenticatedUser) {
 const a=requireOperationApi({...user,activeOperation:undefined},'projects.read');
 const visible=Prisma.sql`p.deleted_at IS NULL AND ${projectVisibility(a)}`;
 if(table==='project_ticket_project')return getPrisma().$queryRaw<Array<{value:string;label:string}>>(Prisma.sql`SELECT p.id::text AS value,p.code||' · '||p.name AS label FROM projects p WHERE ${visible} ORDER BY p.name,p.id`);
 if(table==='project_ticket_type'||table==='project_ticket_status'){
  const name=table==='project_ticket_type'?'project_ticket_types':'project_ticket_statuses';
  return getPrisma().$queryRaw<Array<{value:string;label:string}>>(Prisma.sql`SELECT d.id::text AS value,p.code||' · '||p.name||' / '||d.name AS label FROM ${Prisma.raw(name)} d JOIN projects p ON p.id=d.project_id WHERE d.deleted_at IS NULL AND ${visible} ORDER BY p.name,p.id,d.position,d.id`);
 }
 return getPrisma().$queryRaw<Array<{value:string;label:string}>>(Prisma.sql`SELECT DISTINCT e.id::text AS value,e.last_name||' '||e.first_name||' ('||e.employee_code||')' AS label FROM employees e WHERE e.deleted_at IS NULL AND EXISTS (SELECT 1 FROM project_members m JOIN projects p ON p.id=m.project_id WHERE m.employee_id=e.id AND m.deleted_at IS NULL AND ${visible}) ORDER BY label,value`);
}
export async function ticketSearchResults(user:AuthenticatedUser,definition:SearchDefinition,conditions:Prisma.Sql,offset=0,projectId:string|null=null,ticketIds?:number[]){
 const a=requireOperationApi({...user,activeOperation:undefined},'projects.read');
 if(projectId!==null&&(!/^[1-9]\d*$/.test(projectId)||!Number.isSafeInteger(Number(projectId))))throwApiError(422,'INVALID_PROJECT','Invalid project.');
 const columns:Record<string,string>={id:'t.id',number:'t.number',code:'p.code',title:'t.title',project:'p.name',type:'ty.name',status:'s.name',assignee:"COALESCE(e.last_name,'')||' '||COALESCE(e.first_name,'')",priority:'t.priority',startsOn:'t.starts_on',dueOn:'t.due_on',createdAt:'t.created_at',updatedAt:'t.updated_at'};
 const pattern='%'+definition.keyword.replace(/[\\%_]/g,c=>'\\'+c)+'%';
 return getPrisma().$transaction(async tx=>{
  if(projectId!==null)await detail(tx,a,Number(projectId));
  const from=Prisma.sql`project_tickets t JOIN projects p ON p.id=t.project_id JOIN project_ticket_types ty ON ty.id=t.type_id AND ty.deleted_at IS NULL JOIN project_ticket_statuses s ON s.id=t.status_id AND s.deleted_at IS NULL LEFT JOIN employees e ON e.id=t.assignee_id AND e.deleted_at IS NULL`;
  const quick:Prisma.Sql[]=[];
  for(const [key,column] of Object.entries({projectIds:'p.id',assigneeIds:'t.assignee_id',typeIds:'t.type_id',statusIds:'t.status_id',categories:'s.category'})){
   const raw=definition.options[key];if(typeof raw==='string'){
    const values=raw.split(','),unassigned=key==='assigneeIds'&&values.includes('unassigned'),ids=values.filter(value=>!unassigned||value!=='unassigned');
    const assigned=ids.length?Prisma.sql`${Prisma.raw(column)}::text IN (${Prisma.join(ids)})`:Prisma.sql`false`;
    quick.push(unassigned?Prisma.sql`(${assigned} OR t.assignee_id IS NULL)`:assigned);
   }
  }
  const quickWhere=quick.length?Prisma.sql`(${Prisma.join(quick,' AND ')})`:Prisma.sql`true`;
  const where=Prisma.sql`${quickWhere} AND t.deleted_at IS NULL AND p.deleted_at IS NULL AND ${projectVisibility(a)} AND (${conditions}) AND ${projectId===null?Prisma.sql`true`:Prisma.sql`p.id=${Number(projectId)}`} AND (t.title ILIKE ${pattern} OR t.description ILIKE ${pattern} OR p.name ILIKE ${pattern} OR p.code ILIKE ${pattern} OR (${Prisma.raw(ticketCodeExpression)}) ILIKE ${pattern} OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(t.labels) AS label WHERE label ILIKE ${pattern}))`;
  const selectedWhere=ticketIds?Prisma.sql`(${where}) AND t.id IN (${Prisma.join(ticketIds)})`:where;
  const [total]=await tx.$queryRaw<{count:number}[]>(Prisma.sql`SELECT count(*)::int AS count FROM ${from} WHERE ${selectedWhere}`);
  const searchTotal=ticketIds?(await tx.$queryRaw<{count:number}[]>(Prisma.sql`SELECT count(*)::int AS count FROM ${from} WHERE ${where}`))[0].count:undefined;
  const ids=await tx.$queryRaw<{id:number}[]>(Prisma.sql`SELECT t.id FROM ${from} WHERE ${selectedWhere} ORDER BY ${Prisma.raw(columns[definition.sortBy])} ${definition.sortOrder==='asc'?Prisma.sql`ASC`:Prisma.sql`DESC`} NULLS LAST,${definition.sortBy==='code'?Prisma.sql`t.number ${definition.sortOrder==='asc'?Prisma.sql`ASC`:Prisma.sql`DESC`},`:Prisma.sql``}t.id OFFSET ${offset} LIMIT ${definition.limit}`);
  const tickets=await tx.projectTicket.findMany({where:{id:{in:ids.map(x=>x.id)},deletedAt:null},include:{parent:{select:{id:true,number:true,deletedAt:true}},author:{select:{id:true,employeeCode:true,firstName:true,lastName:true}},assignee:{select:{id:true,employeeCode:true,firstName:true,lastName:true}}}});
  const sums=await tx.projectTimeEntry.groupBy({by:['ticketId'],where:{ticketId:{in:ids.map(x=>x.id)},deletedAt:null},_sum:{minutes:true}});
  const projects:Array<Awaited<ReturnType<typeof detail>>>=[];for(const id of [...new Set(tickets.map(t=>t.projectId))])projects.push(await detail(tx,a,id));
  const relations=await tx.projectTicketRelation.findMany({where:{deletedAt:null,projectId:{in:tickets.map(t=>t.projectId)},from:{deletedAt:null},to:{deletedAt:null}}});
  const referenceIds=[...tickets.flatMap(t=>[t.id,t.parentId]),...relations.flatMap(r=>[r.fromId,r.toId])].filter((id):id is number=>id!==null);
  const references=await tx.projectTicket.findMany({where:{projectId:{in:projects.map(p=>p.id)},id:{in:[...new Set(referenceIds)]}},select:{id:true,projectId:true,number:true}});
  const codeFor=(id:number|null)=>{const t=references.find(t=>t.id===id),p=projects.find(p=>p.id===t?.projectId);return t&&p?ticketCode(p.code,t.number):null;};
  return success(ids.map(({id})=>({...tickets.find(t=>t.id===id)!,code:codeFor(id),parentCode:codeFor(tickets.find(t=>t.id===id)!.parentId),parentNumber:tickets.find(t=>t.id===id)?.parent?.deletedAt===null?tickets.find(t=>t.id===id)?.parent?.number:null,actualMinutes:sums.find(s=>s.ticketId===id)?._sum.minutes??0})),200,{total:total.count,...(searchTotal===undefined?{}:{searchTotal}),offset,limit:definition.limit,projects,relations:relations.map(r=>({...r,fromCode:codeFor(r.fromId),toCode:codeFor(r.toId)}))});
 },{isolationLevel:'RepeatableRead',timeout:30000});
}
