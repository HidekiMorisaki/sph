import {requireOperationApi,writeAuditLog} from '#lib/server/api/admin.js';
import {getPrisma} from '#lib/server/prisma.js';
import {success,failure} from '#lib/server/api/response.js';
import {searchBody} from '#lib/server/api/search-conditions.js';
import {customSearchContexts} from '#lib/server/projects/custom-fields.js';
import {ticketSearchContexts} from '#lib/server/projects/ticket-search-registry.js';
import {parseColumns,storedColumns,defaultColumns} from '#lib/server/projects/ticket-columns.js';
export const GET:import('./$types').RequestHandler=async({locals,setHeaders})=>{
 const actor=requireOperationApi(locals.user,'projects.read');
 const custom=await customSearchContexts(actor,ticketSearchContexts);const customIds=custom[0].fields.filter(f=>f.custom).map(f=>f.code);
 const settings=await getPrisma().employeeSettings.findFirst({where:{employeeId:actor.id,deletedAt:null},select:{projectTicketColumns:true}});
 let columns=defaultColumns;try{if(settings?.projectTicketColumns)columns=storedColumns(settings.projectTicketColumns,customIds);}catch{/* obsolete preferences use defaults */}
 setHeaders({'cache-control':'private, no-store'});return success({employeeId:actor.id,columns,customColumns:custom[0].fields.filter(f=>f.custom).map(f=>({key:f.code,label:f.label}))});
};
export const PUT:import('./$types').RequestHandler=async({locals,request,setHeaders})=>{
 const actor=requireOperationApi(locals.user,'projects.preferences.update');
 if(request.headers.get('x-settings-owner')!==String(actor.id))return failure(409,'SETTINGS_OWNER_CHANGED','The signed-in employee has changed.');
 const body=await searchBody(request);if(Object.keys(body).some(k=>k!=='columns'))return failure(422,'INVALID_COLUMNS','Invalid fields.');
 const custom=await customSearchContexts({...actor,activeOperation:undefined},ticketSearchContexts);
 const columns=parseColumns(body.columns,custom[0].fields.filter(f=>f.custom).map(f=>f.code));
 const stored={schemaVersion:2,columns};
 await getPrisma().$transaction(async tx=>{
  const row=await tx.employeeSettings.upsert({where:{employeeId:actor.id},create:{employeeId:actor.id,projectTicketColumns:stored},update:{projectTicketColumns:stored,deletedAt:null},select:{id:true}});
  await writeAuditLog(tx,actor.id,'update_project_ticket_columns','employee_settings',row.id);
 });
 setHeaders({'cache-control':'private, no-store'});return success({employeeId:actor.id,columns,customColumns:custom[0].fields.filter(f=>f.custom).map(f=>({key:f.code,label:f.label}))});
};
