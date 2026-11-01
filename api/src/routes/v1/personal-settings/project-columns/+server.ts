import {requireOperationApi,writeAuditLog} from '$lib/server/api/admin';
import {getPrisma} from '$lib/server/prisma';
import {success,failure} from '$lib/server/api/response';
import {searchBody} from '$lib/server/api/search-conditions';
import {parseColumns,storedColumns,defaultColumns} from '$lib/server/projects/project-columns';
export const GET:import('./$types').RequestHandler=async({locals,setHeaders})=>{
 const actor=requireOperationApi(locals.user,'projects.read');
 const settings=await getPrisma().employeeSettings.findFirst({where:{employeeId:actor.id,deletedAt:null},select:{projectColumns:true}});
 let columns=defaultColumns;try{if(settings?.projectColumns)columns=storedColumns(settings.projectColumns);}catch{/* obsolete preferences use defaults */}
 setHeaders({'cache-control':'private, no-store'});return success({employeeId:actor.id,columns});
};
export const PUT:import('./$types').RequestHandler=async({locals,request,setHeaders})=>{
 const actor=requireOperationApi(locals.user,'projects.preferences.update');
 if(request.headers.get('x-settings-owner')!==String(actor.id))return failure(409,'SETTINGS_OWNER_CHANGED','The signed-in employee has changed.');
 const body=await searchBody(request);if(Object.keys(body).some(k=>k!=='columns'))return failure(422,'INVALID_COLUMNS','Invalid fields.');
 const columns=parseColumns(body.columns);
 const stored={schemaVersion:1,columns};
 await getPrisma().$transaction(async tx=>{
  const row=await tx.employeeSettings.upsert({where:{employeeId:actor.id},create:{employeeId:actor.id,projectColumns:stored},update:{projectColumns:stored,deletedAt:null},select:{id:true}});
  await writeAuditLog(tx,actor.id,'update_project_columns','employee_settings',row.id);
 });
 setHeaders({'cache-control':'private, no-store'});return success({employeeId:actor.id,columns});
};
