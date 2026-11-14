import type { RequestHandler } from './$types';
import { requireSystemAdminApi, requireOperationApi } from '#lib/server/api/admin.js';
import { success, throwApiError } from '#lib/server/api/response.js';
import { readSystemMetrics } from '#lib/server/system-metrics.js';

export const GET: RequestHandler = async ({ locals, url }) => {
	requireSystemAdminApi(locals.user);
	requireOperationApi(locals.user, 'system.metrics.read');
	const period = url.searchParams.get('period') ?? '24h';
	if (period !== '1h' && period !== '24h' && period !== '7d') throwApiError(400, 'INVALID_PERIOD', 'Choose 1h, 24h or 7d.');
	const response = success(await readSystemMetrics(period));
	response.headers.set('cache-control', 'no-store');
	return response;
};
