import type { RequestHandler } from './$types';
import { requireSystemAdminApi } from '$lib/server/api/admin';
import { success } from '$lib/server/api/response';
import { getReleaseCheck } from '$lib/server/latest-release';
import { systemInformation } from '$lib/server/system-information';

export const GET: RequestHandler = async ({ locals }) => {
	requireSystemAdminApi(locals.user);
	const response = success(await getReleaseCheck(systemInformation.version));
	response.headers.set('Cache-Control', 'private, no-store');
	return response;
};
