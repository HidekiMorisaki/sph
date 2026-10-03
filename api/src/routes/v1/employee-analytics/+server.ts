import type { RequestHandler } from './$types';
import { requireAuthenticatedApi } from '$lib/server/api/admin';
import { employeeAnalytics, parseAnalyticsPeriod, parseAnalyticsReferenceDate } from '$lib/server/api/employee-analytics';
import { employeeReferenceDate } from '$lib/server/api/employee-derived';
import { success } from '$lib/server/api/response';
import { getPrisma } from '$lib/server/prisma';

export const GET: RequestHandler = async ({ locals, url, setHeaders }) => {
	requireAuthenticatedApi(locals.user);
	const referenceDate = parseAnalyticsReferenceDate(url, employeeReferenceDate().toISOString().slice(0, 10));
	const period = parseAnalyticsPeriod(url, referenceDate);
	const employees = await getPrisma().$queryRaw<{
		birthDate: string | null; gender: string | null; hiredAt: string; retiredAt: string | null;
	}[]>`
		SELECT CAST(birth_date AS text) AS "birthDate", gender,
			CAST(hired_at AS text) AS "hiredAt", CAST(retired_at AS text) AS "retiredAt"
		FROM employees WHERE deleted_at IS NULL
	`;
	setHeaders({ 'cache-control': 'private, no-store' });
	return success(employeeAnalytics(employees, referenceDate, period));
};
