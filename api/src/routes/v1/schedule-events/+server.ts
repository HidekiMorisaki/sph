import { requireOperationApi } from '#lib/server/api/admin.js';
import { success } from '#lib/server/api/response.js';
import { createEvent } from '#lib/server/schedule/service.js';
export async function POST({locals,request}:import('./$types').RequestEvent) { const actor=requireOperationApi(locals.user,'schedule.create'); return success(await createEvent(actor,await request.json().catch(()=>null),request.headers.get('idempotency-key')),201); }
