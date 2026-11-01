import { Prisma } from '$lib/server/generated/prisma/client';
import type { AuthenticatedUser } from '$lib/server/auth/types';
import { requireOperationApi, writeAuditLog } from '$lib/server/api/admin';
import { searchBody } from '$lib/server/api/search-conditions';
import { success, throwApiError } from '$lib/server/api/response';
import { getPrisma } from '$lib/server/prisma';
import { parseTicketCode, projectCodePattern, ticketCode } from './codes';
import { projectVisibility } from './service';

export async function resolveProjectReferences(user:AuthenticatedUser|null,request:Request){
 const actor=requireOperationApi(user,'projects.read');
 const body=await searchBody(request);
 const invalid=():never=>throwApiError(422,'INVALID_PROJECT_REFERENCES','Provide up to 500 canonical project or ticket IDs.');
 if(Object.keys(body).some(k=>k!=='codes')||!Array.isArray(body.codes)||body.codes.length>500)invalid();
 const codes=body.codes as unknown[];
 if(codes.some(c=>typeof c!=='string'||(!projectCodePattern.test(c)&&!parseTicketCode(c))))invalid();
 const unique=[...new Set(codes as string[])];
 if(!unique.length)return success([]);
 const ticketRefs=unique.map(c=>parseTicketCode(c)).filter((c):c is NonNullable<typeof c>=>Boolean(c));
 const projects=[...new Set(unique.map(c=>parseTicketCode(c)?.projectCode??c))];
 return getPrisma().$transaction(async tx=>{
  const visible=await tx.$queryRaw<Array<{id:number;code:string;visibility:string}>>(Prisma.sql`SELECT p.id,p.code,p.visibility FROM projects p WHERE p.deleted_at IS NULL AND p.code IN (${Prisma.join(projects)}) AND ${projectVisibility(actor)}`);
  const tickets=ticketRefs.filter(ref=>visible.some(p=>p.code===ref.projectCode));
  const found=tickets.length?await tx.$queryRaw<Array<{projectCode:string;number:number}>>(Prisma.sql`SELECT p.code AS "projectCode",t.number FROM project_tickets t JOIN projects p ON p.id=t.project_id AND p.deleted_at IS NULL WHERE t.deleted_at IS NULL AND ${projectVisibility(actor)} AND (${Prisma.join(tickets.map(ref=>Prisma.sql`(p.code=${ref.projectCode} AND t.number=${ref.number})`),' OR ')})`):[];
  const resolved=new Map<string,string>();
  for(const p of visible)if(unique.includes(p.code))resolved.set(p.code,`/projects/${p.code}/overview`);
  for(const t of found){const code=ticketCode(t.projectCode,t.number);resolved.set(code,`/projects/tickets?ticket=${code}`);}
  // Preserve the existing audit policy for privileged reads of private projects.
  if(actor.permissionOperations.includes('projects.admin')&&actor.permissionOperations.includes('system.manage')){
   for(const p of visible.filter(p=>p.visibility==='private'&&(resolved.has(p.code)||found.some(t=>t.projectCode===p.code)))){
    if(!await tx.projectMember.findFirst({where:{projectId:p.id,employeeId:actor.id,deletedAt:null},select:{id:true}}))await writeAuditLog(tx,actor.id,'project.admin_read','projects',p.id);
   }
  }
  return success(unique.filter(code=>resolved.has(code)).map(code=>({code,href:resolved.get(code)!})));
 },{isolationLevel:'RepeatableRead'});
}
