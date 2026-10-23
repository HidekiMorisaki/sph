import {admin,refreshSource} from '$lib/server/widgets/service';
import {success,failure} from '$lib/server/api/response';
export async function POST({locals,params}:import('./$types').RequestEvent){const actor=admin(locals.user,'sources');const id=Number(params.id);if(!Number.isSafeInteger(id)||id<1)return failure(404,'NOT_FOUND','Source not found.');return success(await refreshSource(id,actor),201);}
