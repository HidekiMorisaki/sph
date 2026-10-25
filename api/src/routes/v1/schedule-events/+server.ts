import { requireOperationApi } from '$lib/server/api/admin';
import { success } from '$lib/server/api/response';
import { createEvent } from '$lib/server/schedule/service';
export async function POST({locals,request}:import('./$types').RequestEvent) { const actor=requireOperationApi(locals.user,'schedule.create'); return success(await createEvent(actor,await request.json().catch(()=>null),request.headers.get('idempotency-key')),201); }
