import type { RequestHandler } from './$types';
import { requireSystemAdminApi } from '$lib/server/api/admin';
import { success } from '$lib/server/api/response';
import { systemInformation } from '$lib/server/system-information';

export const GET: RequestHandler = ({ locals }) => {
	requireSystemAdminApi(locals.user);
	return success(systemInformation);
};
