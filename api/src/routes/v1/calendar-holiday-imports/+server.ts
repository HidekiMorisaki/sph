import { requireOperationApi, requireSystemAdminApi } from '$lib/server/api/admin';
import { permissionOperations } from '$lib/server/auth/permissions';
import { listMeta, parseListQuery } from '$lib/server/api/query';
import { failure, success } from '$lib/server/api/response';
import { WORK_CALENDAR_MIN_YEAR, WORK_CALENDAR_MAX_YEAR, parseHolidayImportInput } from '$lib/server/api/work-calendar-input';
import { HolidayYearUnavailableError, importPublicHolidays } from '$lib/server/calendar-holidays';
import { getPrisma } from '$lib/server/prisma';

const sortFields = ['completedAt', 'status', 'createdAt'] as const;

export async function GET({ locals, url }: import('./$types').RequestEvent) {
	requireOperationApi(locals.user, permissionOperations.calendarRead);
	const query = parseListQuery(url, sortFields, 'completedAt');
	const countryCode = url.searchParams.get('countryCode') ?? 'JP';
	if (countryCode !== 'JP' && countryCode !== 'US') return failure(422, 'INVALID_COUNTRY', 'Unsupported holiday country.');
	const rawYear = url.searchParams.get('calendarYear');
	const calendarYear = rawYear === null ? null : Number(rawYear);
	if (calendarYear !== null && (!/^\d{4}$/.test(rawYear ?? '') || !Number.isInteger(calendarYear) || calendarYear < WORK_CALENDAR_MIN_YEAR || calendarYear > WORK_CALENDAR_MAX_YEAR)) return failure(422, 'INVALID_CALENDAR_YEAR', 'Unsupported calendar year.');
	const status = url.searchParams.get('status');
	if (status !== null && status !== 'success' && status !== 'failed') return failure(422, 'INVALID_STATUS', 'Unsupported import status.');
	const where = {
		countryCode,
		deletedAt: null,
		...(status === null ? {} : { status }),
		...(calendarYear === null ? {} : {
			rangeStart: { lte: new Date(`${calendarYear}-12-31T00:00:00.000Z`) },
			rangeEnd: { gte: new Date(`${calendarYear}-01-01T00:00:00.000Z`) }
		})
	};
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
	const calendar = await getPrisma().workCalendar.findFirst({ where: { id: data.workCalendarId, deletedAt: null }, select: { calendarYear: true, countryCode: true } });
	if (!calendar) return failure(404, 'NOT_FOUND', 'Work calendar not found.');
	try { return success(await importPublicHolidays(actor.id, calendar.calendarYear, calendar.countryCode as 'JP' | 'US'), 201); }
	catch (error) {
		if (error instanceof HolidayYearUnavailableError) return failure(422, 'HOLIDAY_YEAR_UNAVAILABLE', 'Public holidays have not been published for this year. Existing calendar data was kept.');
		return failure(502, 'HOLIDAY_IMPORT_FAILED', 'Unable to refresh public holidays. Existing calendar data was kept.');
	}
}
