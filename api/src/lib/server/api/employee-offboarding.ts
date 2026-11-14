import type { Prisma } from '#lib/server/generated/prisma/client.js';
import type { AuthenticatedUser } from '#lib/server/auth/types.js';
import { hasScopedPermissionOperation } from '#lib/server/auth/permissions.js';
import { getPrisma } from '#lib/server/prisma.js';
import { throwApiError } from './response';
import { writeAuditLog } from './admin';
import { readEmployeeFields, recordEmployeeChange } from './employee-history';
import { readAssetFields, recordAssetChange } from './it-asset-history';
import { recordBookChange } from './books';
import { businessDate, lockBookQueue, reconcileBookQueue } from './book-circulation';
import { lockSystemAdministrators, preserveSystemAdministrator } from './system-administrator-protection';

export async function departureAssets(tx: Prisma.TransactionClient, employeeId: number) {
 const [assignments,loans]=await Promise.all([
  tx.itAssetAssignment.findMany({where:{employeeId,returnedAt:null,deletedAt:null},orderBy:{assetId:'asc'},select:{id:true,assetId:true,assignedAt:true,asset:{select:{assetTag:true,storage:{select:{branchId:true}}}}}}),
  tx.bookLoan.findMany({where:{employeeId,returnedOn:null,deletedAt:null},orderBy:{copyId:'asc'},select:{id:true,loanedOn:true,copy:{select:{copyCode:true,titleId:true,title:{select:{name:true}},storage:{select:{branchId:true}}}}}})
 ]);
 return {assignments,loans};
}
export function authorizeReturns(actor:AuthenticatedUser, assets:Awaited<ReturnType<typeof departureAssets>>) {
 if(assets.assignments.some(a=>!hasScopedPermissionOperation(actor,'assets.return',a.asset.storage.branchId)) || assets.loans.some(l=>!hasScopedPermissionOperation(actor,'books.loans.return',l.copy.storage.branchId)))
  throwApiError(403,'ASSET_RETURN_PERMISSION_REQUIRED','Permission to return every assigned asset is required.');
}
export async function ensureAssetsReturned(tx:Prisma.TransactionClient,id:number){
 const assets=await departureAssets(tx,id);
 if(assets.assignments.length||assets.loans.length)throwApiError(409,'ASSETS_NOT_RETURNED','Return every IT asset and borrowed book before departure.');
}
export async function returnDepartureAssets(tx:Prisma.TransactionClient,id:number,actor:AuthenticatedUser,confirmation:unknown,effectiveOn:Date){
 let assets=await departureAssets(tx,id);authorizeReturns(actor,assets);
 for(const a of assets.assignments)await tx.$queryRaw`SELECT id FROM it_assets WHERE id=${a.assetId} FOR UPDATE`;
 const titleIds=[...new Set(assets.loans.map(l=>l.copy.titleId))].sort((a,b)=>a-b);
 for(const titleId of titleIds)await lockBookQueue(tx,titleId);
 assets=await departureAssets(tx,id);authorizeReturns(actor,assets);
 const body=confirmation as {assignmentIds?:unknown;loanIds?:unknown;returnedOn?:unknown;confirmed?:unknown}|null;
 const same=(raw:unknown,ids:number[])=>Array.isArray(raw)&&raw.length===ids.length&&raw.every(n=>Number.isSafeInteger(n))&&new Set(raw).size===raw.length&&ids.every(n=>raw.includes(n));
 if(!body || body.confirmed!==true || !same(body.assignmentIds,assets.assignments.map(a=>a.id)) || !same(body.loanIds,assets.loans.map(l=>l.id)))
  throwApiError(409,'DEPARTURE_CONFIRMATION_REQUIRED','Review and confirm the current assets before departure.');
 const raw=body.returnedOn;
 if(typeof raw!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(raw))throwApiError(422,'INVALID_RETURN_DATE','Enter a valid return date.');
 const returnedOn=new Date(raw+'T00:00:00.000Z'),today=businessDate();
 if(!Number.isFinite(returnedOn.getTime())||returnedOn.toISOString().slice(0,10)!==raw||returnedOn>today||returnedOn>effectiveOn||assets.assignments.some(a=>businessDay(a.assignedAt)>returnedOn)||assets.loans.some(l=>l.loanedOn>returnedOn))
  throwApiError(422,'INVALID_RETURN_DATE','Return date must be after allocation and no later than today or departure.');
 const returnedAt=new Date(Math.min(new Date(raw+'T23:59:59.999+09:00').getTime(),Date.now()));
 for(const a of assets.assignments){
  const before=await readAssetFields(tx,a.assetId);
  await tx.itAssetAssignment.update({where:{id:a.id},data:{returnedAt}});
  await recordAssetChange(tx,a.assetId,actor.id,'return',before,await readAssetFields(tx,a.assetId));
  await writeAuditLog(tx,actor.id,'return','it_asset_assignment',a.id);
 }
 for(const l of assets.loans){
  await tx.bookLoan.update({where:{id:l.id},data:{returnedOn}});
  await recordBookChange(tx,actor.id,'book_loan',l.id,'return',{returnedOn:raw});
  await writeAuditLog(tx,actor.id,'return','book_loan',l.id);
 }
 for(const l of assets.loans)await reconcileBookQueue(tx,l.copy.titleId,l.copy.storage.branchId,today);
 await tx.employee.update({where:{id},data:{assetReturnCompletedAt:new Date()}});
 await writeAuditLog(tx,actor.id,'confirm_asset_returns','employee',id);
}
function businessDay(value:Date){const day=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo'}).format(value);return new Date(day+'T00:00:00Z');}
export async function ensureNoBranchResponsibility(tx:Prisma.TransactionClient,id:number){
 if(await tx.branch.count({where:{deletedAt:null,OR:[{managerEmployeeId:id},{deputyManagerEmployeeId:id}]}}))throwApiError(409,'BRANCH_RESPONSIBILITY','Reassign branch responsibility before departure.');
}
export async function deleteEmployeeRecord(tx:Prisma.TransactionClient,id:number,actorId:number){
 await preserveSystemAdministrator(tx,id);await ensureAssetsReturned(tx,id);await ensureNoBranchResponsibility(tx,id);
 const before=await readEmployeeFields(tx,id),deletedAt=new Date();
 await tx.employee.update({where:{id},data:{deletedAt}});
 await tx.employeeRole.updateMany({where:{deletedAt:null,OR:[{employeeId:id},{scopeEmployeeId:id}]},data:{deletedAt}});
 await tx.savedSearchFilter.updateMany({where:{ownerEmployeeId:id,deletedAt:null},data:{deletedAt,revision:{increment:1}}});
 await tx.employeeTeam.updateMany({where:{employeeId:id,deletedAt:null},data:{deletedAt}});
 await tx.employeePosition.updateMany({where:{employeeId:id,deletedAt:null},data:{deletedAt,isPrimary:false}});
 await tx.employeeDepartment.updateMany({where:{employeeId:id,deletedAt:null},data:{deletedAt,isPrimary:false}});
 await tx.employeeSocialLink.updateMany({where:{employeeId:id,deletedAt:null},data:{deletedAt}});
 await tx.session.updateMany({where:{employeeId:id,deletedAt:null},data:{deletedAt}});
 await tx.accountInvitation.updateMany({where:{employeeId:id,usedAt:null,deletedAt:null},data:{deletedAt}});
 await recordEmployeeChange(tx,id,actorId,'delete',before,null);await writeAuditLog(tx,actorId,'delete','employee',id);
}
let running:Promise<void>|undefined;
export function processDueEmployeeDeletions(){
 if(running)return running;
 running=(async()=>{
  const due=await getPrisma().employee.findMany({where:{deletedAt:null,deletionScheduledOn:{lte:businessDate()}},select:{id:true},orderBy:{id:'asc'},take:100});
  for(const {id} of due)try{await getPrisma().$transaction(async tx=>{
   await lockSystemAdministrators(tx);await tx.$queryRaw`SELECT id FROM employees WHERE id=${id} FOR UPDATE`;
   const employee=await tx.employee.findFirst({where:{id,deletedAt:null,deletionScheduledOn:{lte:businessDate()}},select:{deletionRequestedById:true}});
   if(employee?.deletionRequestedById)await deleteEmployeeRecord(tx,id,employee.deletionRequestedById);
  },{timeout:30000});}catch{console.warn('A scheduled employee deletion could not be completed; it will be retried.');}
 })().finally(()=>{running=undefined;});return running;
}
let started=false;
export function startEmployeeDeletions(){if(started)return;started=true;const run=()=>void processDueEmployeeDeletions().catch(()=>console.warn('Scheduled employee deletion check failed; it will be retried.'));run();setInterval(run,10000).unref();}
