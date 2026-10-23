import {widgetData} from '$lib/server/widgets/data';import {success} from '$lib/server/api/response';
export async function GET({locals,params}:import('./$types').RequestEvent){const response=success(await widgetData(locals.user,params.key));response.headers.set('Cache-Control','no-store');return response;}
