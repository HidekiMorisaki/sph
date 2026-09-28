import { requireAuthenticatedApi, requireSystemAdminApi } from '$lib/server/api/admin';
import { listMeta, parseListQuery } from '$lib/server/api/query';
import { failure, success } from '$lib/server/api/response';
import { parseHolidayImportInput } from '$lib/server/api/work-calendar-input';
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

export async function POST({ locals, request }: import('./$types').RequestEvent) {
	const actor = requireSystemAdminApi(locals.user);
	const data = parseHolidayImportInput(await request.json().catch(() => null));
	if (!data) return failure(400, 'INVALID_REQUEST', 'A valid work calendar is required.', [{ field: 'workCalendarId', reason: 'INVALID_VALUE' }]);
	const calendar = await getPrisma().workCalendar.findFirst({ where: { id: data.workCalendarId, deletedAt: null }, select: { calendarYear: true } });
	if (!calendar) return failure(404, 'NOT_FOUND', 'Work calendar not found.');
	try { return success(await importCabinetOfficeHolidays(actor.id, calendar.calendarYear), 201); }
	catch { return failure(502, 'HOLIDAY_IMPORT_FAILED', 'Unable to refresh public holidays. Existing calendar data was kept.'); }
}
