import {getPrisma} from '$lib/server/prisma';
import {personal} from './service';
import {isRetiredOfficial} from './retirement';
import {manifest,settings} from './contract';
import {localDate} from './local-date';
import {throwApiError} from '$lib/server/api/response';
import {requireOperationApi} from '$lib/server/api/admin';
import type {AuthenticatedUser} from '$lib/server/auth/types';
import {businessDate,plusDays} from '$lib/server/api/book-circulation';

export async function widgetData(user:AuthenticatedUser|null,key:string) {
 const actor=personal(user),db=getPrisma();
 if(!/^[0-9a-f-]{36}$/i.test(key))throwApiError(404,'NOT_FOUND','Widget not found.');
 const i=await db.widgetInstance.findFirst({where:{instanceKey:key,deletedAt:null,layout:{employeeId:actor.id,deletedAt:null}},include:{release:{include:{approval:true,source:true}}}});
 if(i&&isRetiredOfficial(i.release.widgetCode,i.release.source.sourceKey))throwApiError(404,'NOT_FOUND','Widget not found.');
 if(!i)throwApiError(404,'NOT_FOUND','Widget not found.');
 if(!i.enabled || i.release.deletedAt || i.release.source.deletedAt || !i.release.approval?.allowed || i.release.approval.deletedAt)throwApiError(403,'WIDGET_STOPPED','Widget disabled or stopped by administrator.');
 const def=manifest(i.release.definition),date=localDate(actor.timeZone);
 settings(def,i.size,i.settings);
 const data:Record<string,unknown>={date};
 const saved=def.storage?await db.widgetRecord.findFirst({where:{instanceId:i.id,recordKey:'default',deletedAt:null},select:{values:true,revision:true}}):null;
 if(def.runtime)data.recordRevision=saved?.revision??0;
 const stored=saved?.values as Record<string,unknown>|undefined;
 if(def.view.some(b=>b.type==='personal_note'))data.note=stored?.note??'';
 for(const capability of def.capabilities) {
  if(capability==='account')data.account=[{name:actor.roles.map(r=>r.name).join(', ')},{name:actor.email??''}];
  else if(capability==='world_clock')data.world_clock=stored?.timeZones??['Asia/Tokyo'];
  else if(capability==='book_notices'||capability==='book_loans') {
   requireOperationApi(actor,'books.read');const today=businessDate();
   const loans=await db.bookLoan.findMany({where:{employeeId:actor.id,deletedAt:null,returnedOn:null,copy:{deletedAt:null},...(capability==='book_notices'?{dueOn:{lte:plusDays(today,7)}}:{})},select:{id:true,dueOn:true,copy:{select:{copyCode:true,title:{select:{id:true,name:true}}}}},orderBy:[{dueOn:'asc'},{id:'asc'}],take:100});
   data[capability]=loans.map(l=>({name:l.copy.title.name+' ('+l.copy.copyCode+')',date:l.dueOn.toISOString().slice(0,10),kind:capability==='book_notices'?(l.dueOn<today?'overdue':'due_soon'):null,href:'/books/'+l.copy.title.id}));
  }
 }
 // Approval and ownership may have changed while waiting for a provider.
 if(!await db.widgetInstance.findFirst({where:{id:i.id,enabled:true,deletedAt:null,layout:{employeeId:actor.id,deletedAt:null},release:{deletedAt:null,source:{deletedAt:null},approval:{allowed:true,deletedAt:null}}},select:{id:true}}))throwApiError(403,'WIDGET_STOPPED','Widget stopped.');
 return data;
}
