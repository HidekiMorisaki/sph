import { requireScopedOperationApi } from '$lib/server/api/branch-access';
import { hasScopedPermissionOperation } from '$lib/server/auth/permissions';
import { getPrisma } from '$lib/server/prisma';
import { parseId } from '$lib/server/api/database';
import { authorizeReturns, departureAssets } from '$lib/server/api/employee-offboarding';
import { failure, success } from '$lib/server/api/response';
import { protectSystemAdministrator } from '$lib/server/api/system-administrator-protection';

export async function GET({locals,params}:import('./$types').RequestEvent){
 const {actor,branchId}=requireScopedOperationApi(locals.user,'employees.read'),id=parseId(params.id);
 if(!id)return failure(404,'NOT_FOUND','Not found.');
 const employee=await getPrisma().employee.findFirst({where:{id,deletedAt:null,...(branchId===null?{}:{branchId})},select:{branchId:true,retiredAt:true,deletionScheduledOn:true}});
 if(!employee)return failure(404,'NOT_FOUND','Not found.');
 if(!hasScopedPermissionOperation(actor,'employees.update',employee.branchId)&&!hasScopedPermissionOperation(actor,'employees.delete',employee.branchId))return failure(403,'PERMISSION_REQUIRED','Permission is required.');
 return getPrisma().$transaction(async tx=>{
  await protectSystemAdministrator(tx,actor,id);
  const assets=await departureAssets(tx,id);authorizeReturns(actor,assets);
  return success({...assets,retiredAt:employee.retiredAt,deletionScheduledOn:employee.deletionScheduledOn});
 });
}
