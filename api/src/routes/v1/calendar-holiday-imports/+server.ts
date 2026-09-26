import { requireAuthenticatedApi, requireSystemAdminApi } from '$lib/server/api/admin';
import { listMeta, parseListQuery } from '$lib/server/api/query';
import { failure, success } from '$lib/server/api/response';
import { importCabinetOfficeHolidays } from '$lib/server/calendar-holidays';
import { getPrisma } from '$lib/server/prisma';

const sortFields = ['completedAt', 'status', 'createdAt'] as const;

export async function GET({ locals, url }: import('./$types').RequestEvent) {
	requireAuthenticatedApi(locals.user);
	const query = parseListQuery(url, sortFields, 'completedAt');
	const where = { deletedAt: null };
	const [total, items] = await getPrisma().$transaction([
		getPrisma().calendarHolidayImport.count({ where }),
		getPrisma().calendarHolidayImport.findMany({ where, orderBy: [{ [query.sortBy]: query.sortOrder }, { id: 'desc' }], skip: query.offset, take: query.limit })
	]);
	return success(items, 200, listMeta(query, items.length, total));
}

export async function POST({ locals }: import('./$types').RequestEvent) {
	const actor = requireSystemAdminApi(locals.user);
	try { return success(await importCabinetOfficeHolidays(actor.id), 201); }
	catch { return failure(502, 'HOLIDAY_IMPORT_FAILED', 'Unable to refresh public holidays. Existing calendar data was kept.'); }
}
