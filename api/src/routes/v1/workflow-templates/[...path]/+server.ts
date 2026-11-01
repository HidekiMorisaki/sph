import {workflowEndpoint} from '$lib/server/workflow/service';
import type {RequestEvent} from './$types';
async function handle({locals,request,url,params}:RequestEvent){return workflowEndpoint(locals.user,request,url,'templates',params.path);}
export {handle as GET,handle as POST,handle as PATCH,handle as PUT,handle as DELETE};
