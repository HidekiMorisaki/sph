import { requireOperationApi } from '#lib/server/api/admin.js';
import { success } from '#lib/server/api/response.js';
import { respond } from '#lib/server/schedule/service.js';
export async function PUT({locals,params,request}:import('./$types').RequestEvent) {const actor=requireOperationApi(locals.user,'schedule.respond');const body=await request.json().catch(()=>null);return success(await respond(actor,params.key,body?.response,body?.expectedRevision));}
