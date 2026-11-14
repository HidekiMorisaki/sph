import type { RequestHandler } from './$types';
import { requireSystemAdminApi } from '#lib/server/api/admin.js';
import { success } from '#lib/server/api/response.js';
import { getReleaseCheck } from '#lib/server/latest-release.js';
import { systemInformation } from '#lib/server/system-information.js';

export const GET: RequestHandler = async ({ locals }) => {
	requireSystemAdminApi(locals.user);
	const response = success(await getReleaseCheck(systemInformation.version));
	response.headers.set('Cache-Control', 'private, no-store');
	return response;
};
