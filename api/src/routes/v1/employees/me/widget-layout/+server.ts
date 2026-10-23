import {layout,personal,updateLayout} from '$lib/server/widgets/service';import {success} from '$lib/server/api/response';
export async function GET({locals}:import('./$types').RequestEvent){return success(await layout(personal(locals.user)));}
export async function PUT({locals,request}:import('./$types').RequestEvent){const actor=personal(locals.user,true);return success(await updateLayout(actor,await request.json().catch(()=>null)));}
