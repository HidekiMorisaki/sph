import {Prisma} from '#lib/server/generated/prisma/client.js';
import {getPrisma} from '#lib/server/prisma.js';
import type {AuthenticatedUser} from '#lib/server/auth/types.js';
import {admin,visible,workflowRead,workflowListSelect,workflowListItems} from './service';
import {workflowPeople,workflowApplicantExpression} from './search-registry';
import {invalidSearch,type SearchDefinition} from '../api/search-conditions';
import {success} from '../api/response';

// Kept next to the search query; the final row fetch additionally applies the
// existing Prisma visibility guard. Counts and candidate lists use the same SQL.
export function workflowVisibility(user:AuthenticatedUser):Prisma.Sql{
 if(admin(user))return Prisma.sql`true`;
 return Prisma.sql`(workflow.applicant_id=${user.id}
 OR (workflow.attempt>0 AND EXISTS(SELECT 1 FROM workflow_steps visible_step WHERE visible_step.request_id=workflow.id AND visible_step.employee_id=${user.id} AND visible_step.deleted_at IS NULL))
 OR (workflow.attempt>0 AND EXISTS(SELECT 1 FROM workflow_actions visible_action WHERE visible_action.request_id=workflow.id AND visible_action.type='reassigned' AND visible_action.deleted_at IS NULL AND visible_action.detail->'previousEmployeeId'=to_jsonb(${user.id}::integer))))`;
}
function from(history:boolean){return Prisma.sql`workflow_requests workflow JOIN workflow_template_versions version ON version.id=workflow.template_version_id JOIN employees applicant ON applicant.id=workflow.applicant_id CROSS JOIN (SELECT ${history}::boolean AS include_history) search_options`;}
const name="concat_ws(' ',person.last_name,NULLIF(person.middle_name,''),person.first_name)";
export async function workflowOptions(kind:string,user:AuthenticatedUser){
 workflowRead({...user,activeOperation:undefined});
 const role=kind.replace('workflow_','');
 let source:Prisma.Sql;
 if(role==='template'){
  return getPrisma().$queryRaw<{value:string;label:string}[]>(Prisma.sql`SELECT value,label FROM (SELECT DISTINCT ON (version.template_id) version.template_id::text AS value,version.name AS label FROM ${from(true)} WHERE workflow.deleted_at IS NULL AND ${workflowVisibility(user)} ORDER BY version.template_id,version.version DESC) choices ORDER BY label,value`);
 }
 if(role==='applicant')source=Prisma.sql`LATERAL (SELECT applicant.id AS employee_id) candidate`;
 else if(['approver','finalApprover','currentAssignee'].includes(role))source=Prisma.sql`LATERAL (${Prisma.raw(workflowPeople(role as 'approver'|'finalApprover'|'currentAssignee'))}) candidate`;
 else invalidSearch('selection');
 return getPrisma().$queryRaw<{value:string;label:string}[]>(Prisma.sql`SELECT DISTINCT person.id::text AS value,(${Prisma.raw(name)} || ' · ' || person.employee_code) AS label FROM ${from(true)} CROSS JOIN ${source} JOIN employees person ON person.id=candidate.employee_id WHERE workflow.deleted_at IS NULL AND ${workflowVisibility(user)} ORDER BY label,value`);
}
export async function workflowSearchResults(user:AuthenticatedUser,definition:SearchDefinition,conditions:Prisma.Sql,offset=0){
 workflowRead({...user,activeOperation:undefined});
 const filters:Prisma.Sql[]=[Prisma.sql`workflow.deleted_at IS NULL`,workflowVisibility(user),conditions];
 const options=definition.options;
 if(options.view==='mine')filters.push(Prisma.sql`workflow.applicant_id=${user.id}`);
 if(options.view==='pending')filters.push(Prisma.sql`workflow.status='pending' AND EXISTS(SELECT 1 FROM workflow_steps current_step WHERE current_step.request_id=workflow.id AND current_step.attempt=workflow.attempt AND current_step.position=workflow.current_step AND current_step.employee_id=${user.id} AND current_step.status='pending' AND current_step.deleted_at IS NULL)`);
 if(options.view!==undefined&&!['all','mine','pending'].includes(String(options.view)))invalidSearch('view');
 if(options.statuses)filters.push(Prisma.sql`workflow.status IN (${Prisma.join(String(options.statuses).split(','))})`);
 if(options.applicantIds)filters.push(Prisma.sql`workflow.applicant_id::text IN (${Prisma.join(String(options.applicantIds).split(','))})`);
 if(options.templateIds)filters.push(Prisma.sql`version.template_id::text IN (${Prisma.join(String(options.templateIds).split(','))})`);
 for(const [key,role] of [['approverIds','approver'],['finalApproverIds','finalApprover'],['currentAssigneeIds','currentAssignee']] as const){
  if(options[key])filters.push(Prisma.sql`EXISTS(SELECT 1 FROM LATERAL (${Prisma.raw(workflowPeople(role))}) selected_person WHERE selected_person.employee_id::text IN (${Prisma.join(String(options[key]).split(','))}))`);
 }
 for(const term of definition.keyword.trim().split(/\s+/).filter(Boolean)){
  const pattern='%'+term.toLowerCase().replace(/[\\%_]/g,c=>'\\'+c)+'%';
  filters.push(Prisma.sql`(lower(workflow.title) LIKE ${pattern} OR lower(version.name) LIKE ${pattern} OR lower(${Prisma.raw(workflowApplicantExpression)}) LIKE ${pattern} OR EXISTS(SELECT 1 FROM LATERAL (${Prisma.raw(workflowPeople('approver'))}) keyword_person WHERE lower(keyword_person.person_name) LIKE ${pattern}))`);
 }
 const sorts:Record<string,string>={id:'workflow.id',title:'workflow.title',status:'workflow.status',createdAt:'workflow.created_at',updatedAt:'workflow.updated_at'};
 const sort=sorts[definition.sortBy];if(!sort||!['asc','desc'].includes(definition.sortOrder))invalidSearch('sort');
 const where=Prisma.join(filters,' AND '),history=options.includeHistory===true;
 return getPrisma().$transaction(async tx=>{
  const [{total}]=await tx.$queryRaw<{total:number}[]>(Prisma.sql`SELECT count(*)::integer AS total FROM ${from(history)} WHERE ${where}`);
  const ids=await tx.$queryRaw<{id:number}[]>(Prisma.sql`SELECT workflow.id FROM ${from(history)} WHERE ${where} ORDER BY ${Prisma.raw(sort)} ${Prisma.raw(definition.sortOrder)},workflow.id ASC OFFSET ${offset} LIMIT ${definition.limit}`);
  const rows=await tx.workflowRequest.findMany({where:{id:{in:ids.map(row=>row.id)},deletedAt:null,...visible(user)},select:workflowListSelect});
  const ordered=ids.flatMap(row=>rows.find(item=>item.id===row.id)??[]);
  return success(workflowListItems(ordered,user),200,{total,offset,limit:definition.limit});
 },{isolationLevel:'RepeatableRead'});
}
