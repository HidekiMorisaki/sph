import { isHttpError } from '@sveltejs/kit';
import { requireScopedOperationApi } from '$lib/server/api/branch-access';
import { getPrisma } from '$lib/server/prisma';
import { parseId } from '$lib/server/api/database';
import { deleteEmployeeRecord, ensureNoBranchResponsibility, returnDepartureAssets } from '$lib/server/api/employee-offboarding';
import { employeeConflictResponse } from '$lib/server/api/employee-errors';
import { lockSystemAdministrators, preserveSystemAdministrator, protectSystemAdministrator } from '$lib/server/api/system-administrator-protection';
import { businessDate } from '$lib/server/api/book-circulation';
import { failure, success, throwApiError } from '$lib/server/api/response';
import { writeAuditLog } from '$lib/server/api/admin';
import { readEmployeeFields, recordEmployeeChange } from '$lib/server/api/employee-history';

export async function PUT({locals,params,request}:import('./$types').RequestEvent){
 const {actor,branchId}=requireScopedOperationApi(locals.user,'employees.manage'),id=parseId(params.id);
 if(!id)return failure(404,'NOT_FOUND','Not found.');
 const body=await request.json().catch(()=>null) as {deletionOn?:unknown;confirmation?:unknown}|null;
 const raw=body?.deletionOn,date=typeof raw==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(raw)?new Date(raw+'T00:00:00Z'):null;
 if(!date||!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==raw)return failure(422,'INVALID_DEPARTURE_DATE','Enter a valid deletion date.');
 try{return await getPrisma().$transaction(async tx=>{
  await lockSystemAdministrators(tx);await tx.$queryRaw`SELECT id FROM employees WHERE id=${id} FOR UPDATE`;
  const employee=await tx.employee.findFirst({where:{id,deletedAt:null,...(branchId===null?{}:{branchId})},select:{hiredAt:true,deletionScheduledOn:true}});
  if(!employee)return failure(404,'NOT_FOUND','Not found.');
  await protectSystemAdministrator(tx,actor,id);await preserveSystemAdministrator(tx,id);
  if(date<employee.hiredAt)throwApiError(422,'INVALID_DEPARTURE_DATE','Deletion date cannot precede hire date.');
  if(employee.deletionScheduledOn&&employee.deletionScheduledOn<=businessDate())throwApiError(409,'DELETION_DUE','The scheduled deletion is already due.');
  await ensureNoBranchResponsibility(tx,id);
  const before=await readEmployeeFields(tx,id);
  await returnDepartureAssets(tx,id,actor,body?.confirmation,date);
  await tx.employee.update({where:{id},data:{deletionScheduledOn:date,deletionRequestedById:actor.id}});
  await recordEmployeeChange(tx,id,actor.id,'update',before,await readEmployeeFields(tx,id));
  await writeAuditLog(tx,actor.id,'schedule_delete','employee',id);
  if(date<=businessDate())await deleteEmployeeRecord(tx,id,actor.id);
  return success({id,deletionScheduledOn:date,deleted:date<=businessDate()});
 },{timeout:30000});}catch(error){if(isHttpError(error))throw error;return employeeConflictResponse(error)??Promise.reject(error);}
}
export async function DELETE({locals,params}:import('./$types').RequestEvent){
 const {actor,branchId}=requireScopedOperationApi(locals.user,'employees.manage'),id=parseId(params.id);
 if(!id)return failure(404,'NOT_FOUND','Not found.');
 return getPrisma().$transaction(async tx=>{
  await lockSystemAdministrators(tx);await tx.$queryRaw`SELECT id FROM employees WHERE id=${id} FOR UPDATE`;
  const employee=await tx.employee.findFirst({where:{id,deletedAt:null,...(branchId===null?{}:{branchId})},select:{retiredAt:true,deletionScheduledOn:true}});
  if(!employee)return failure(404,'NOT_FOUND','Not found.');
  await protectSystemAdministrator(tx,actor,id);
  if(!employee.deletionScheduledOn)return failure(409,'NO_DELETION_RESERVATION','No deletion is scheduled.');
  if(employee.deletionScheduledOn<=businessDate())return failure(409,'DELETION_DUE','The scheduled deletion is already due.');
  const before=await readEmployeeFields(tx,id);
  await tx.employee.update({where:{id},data:{deletionScheduledOn:null,deletionRequestedById:null,...(!employee.retiredAt?{assetReturnCompletedAt:null}:{})}});
  await recordEmployeeChange(tx,id,actor.id,'update',before,await readEmployeeFields(tx,id));
  await writeAuditLog(tx,actor.id,'cancel_scheduled_delete','employee',id);return success({id,cancelled:true});
 });
}
