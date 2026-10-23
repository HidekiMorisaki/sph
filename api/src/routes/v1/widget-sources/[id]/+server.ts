import {getPrisma} from '$lib/server/prisma';
import {admin} from '$lib/server/widgets/service';
import {writeAuditLog} from '$lib/server/api/admin';
import {failure,success} from '$lib/server/api/response';
export async function DELETE({locals,params}:import('./$types').RequestEvent){
 const actor=admin(locals.user,'sources');const id=Number(params.id);
 if(!Number.isSafeInteger(id)||id<1)return failure(404,'NOT_FOUND','Source not found.');
 return getPrisma().$transaction(async tx=>{const source=await tx.widgetSource.findFirst({where:{id,deletedAt:null}});if(!source)return failure(404,'NOT_FOUND','Source not found.');if(source.sourceKey==='sph-official')return failure(409,'PROTECTED_SOURCE','The bundled source is protected. Stop individual releases instead.');
 await tx.widgetSource.update({where:{id},data:{deletedAt:new Date()}});await writeAuditLog(tx,actor.id,'remove_widget_source','widget_source',id);return success({id});});
}
