import { requireOperationApi } from '$lib/server/api/admin';
import { success } from '$lib/server/api/response';
import { respond } from '$lib/server/schedule/service';
export async function PUT({locals,params,request}:import('./$types').RequestEvent) {const actor=requireOperationApi(locals.user,'schedule.respond');const body=await request.json().catch(()=>null);return success(await respond(actor,params.key,body?.response,body?.expectedRevision));}
