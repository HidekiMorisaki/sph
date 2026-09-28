import { requireAuthenticatedApi, requireSystemAdminApi, writeAuditLog } from '$lib/server/api/admin';
import { parseId } from '$lib/server/api/database';
import { listMeta, parseListQuery } from '$lib/server/api/query';
import { failure, success } from '$lib/server/api/response';
import { parseWorkCalendarEntryInput, workDateIsInCalendarYear } from '$lib/server/api/work-calendar-input';
import { getPrisma } from '$lib/server/prisma';

const sortFields = ['workDate', 'entryType', 'title', 'createdAt', 'updatedAt'] as const;

export async function GET({ locals, params, url }: import('./$types').RequestEvent) {
	requireAuthenticatedApi(locals.user);
	const calendarId = parseId(params.id);
	if (!calendarId || !await getPrisma().workCalendar.count({ where: { id: calendarId, deletedAt: null } })) return failure(404, 'NOT_FOUND', 'Work calendar not found.');
	const query = parseListQuery(url, sortFields, 'workDate');
	const where = { calendarId, deletedAt: null };
	const [total, items] = await getPrisma().$transaction([
		getPrisma().workCalendarDay.count({ where }),
		getPrisma().workCalendarDay.findMany({ where, orderBy: [{ [query.sortBy]: query.sortOrder }, { id: 'asc' }], skip: query.offset, take: query.limit })
	]);
	return success(items, 200, listMeta(query, items.length, total));
}

export async function POST({ locals, params, request }: import('./$types').RequestEvent) {
	const actor = requireSystemAdminApi(locals.user);
	const calendarId = parseId(params.id);
	const data = parseWorkCalendarEntryInput(await request.json().catch(() => null));
	if (!calendarId || !data) return failure(400, 'INVALID_REQUEST', 'Invalid calendar entry data.');
	const item = await getPrisma().$transaction(async (tx) => {
		const calendar = await tx.workCalendar.findFirst({ where: { id: calendarId, deletedAt: null }, select: { calendarYear: true } });
		if (!calendar) return null;
		if (!workDateIsInCalendarYear(data.workDate, calendar.calendarYear)) return 'outside_year' as const;
		const existing = await tx.workCalendarDay.findUnique({ where: { calendarId_workDate: { calendarId, workDate: data.workDate } } });
		if (existing && !existing.deletedAt) return 'duplicate' as const;
		const saved = existing
			? await tx.workCalendarDay.update({ where: { id: existing.id }, data: { ...data, deletedAt: null } })
			: await tx.workCalendarDay.create({ data: { calendarId, ...data } });
		await writeAuditLog(tx, actor.id, 'create', 'work_calendar_entry', saved.id);
		return saved;
	});
	if (!item) return failure(404, 'NOT_FOUND', 'Work calendar not found.');
	if (item === 'outside_year') return failure(422, 'DATE_OUTSIDE_CALENDAR_YEAR', 'The entry date must be within the calendar year.', [{ field: 'workDate', reason: 'OUT_OF_RANGE' }]);
	if (item === 'duplicate') return failure(409, 'DUPLICATE_VALUE', 'A calendar entry already exists on this date.', [{ field: 'workDate', reason: 'DUPLICATE_VALUE' }]);
	return success(item, 201);
}
