import { requireOperationApi } from '$lib/server/api/admin';
import { success } from '$lib/server/api/response';
import { getOccurrence,present,mutateEvent } from '$lib/server/schedule/service';
import { resizeEvent } from '$lib/server/schedule/resize';
export async function GET({locals,params}:import('./$types').RequestEvent) {const actor=requireOperationApi(locals.user,'schedule.read');return success(present(await getOccurrence(params.key),actor));}
export async function PATCH({locals,params,request}:import('./$types').RequestEvent) {const actor=requireOperationApi(locals.user,'schedule.update');const body=await request.json().catch(()=>null);return success(body?.resize!==undefined?await resizeEvent(actor,params.key,body):await mutateEvent(actor,params.key,body));}
export async function DELETE({locals,params,request}:import('./$types').RequestEvent) {const actor=requireOperationApi(locals.user,'schedule.cancel');return success(await mutateEvent(actor,params.key,await request.json().catch(()=>null),true));}
