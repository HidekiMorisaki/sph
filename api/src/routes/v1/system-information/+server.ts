import type { RequestHandler } from './$types';
import { requireSystemAdminApi } from '#lib/server/api/admin.js';
import { success } from '#lib/server/api/response.js';
import { systemInformation } from '#lib/server/system-information.js';

export const GET: RequestHandler = ({ locals }) => {
	requireSystemAdminApi(locals.user);
	return success(systemInformation);
};
