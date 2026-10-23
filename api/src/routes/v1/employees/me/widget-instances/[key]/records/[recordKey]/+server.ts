import {getRecord,mutateRecord,readRecordBody} from '$lib/server/widgets/records';
import {success} from '$lib/server/api/response';
export async function GET({locals,params,setHeaders}:import('./$types').RequestEvent){setHeaders({'cache-control':'no-store'});return success(await getRecord(locals.user,params.key,params.recordKey));}
export async function PUT({locals,params,request}:import('./$types').RequestEvent){return success(await mutateRecord(locals.user,params.key,'update',await readRecordBody(request),params.recordKey));}
export async function DELETE({locals,params,request}:import('./$types').RequestEvent){return success(await mutateRecord(locals.user,params.key,'delete',await readRecordBody(request),params.recordKey));}
