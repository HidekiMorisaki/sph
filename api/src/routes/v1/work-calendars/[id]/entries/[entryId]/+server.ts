import { requireSystemAdminApi, writeAuditLog } from '$lib/server/api/admin';
import { parseId } from '$lib/server/api/database';
import { failure, success } from '$lib/server/api/response';
import { parseWorkCalendarEntryInput, workDateIsInCalendarYear } from '$lib/server/api/work-calendar-input';
import { getPrisma } from '$lib/server/prisma';

export async function PATCH({ locals, params, request }: import('./$types').RequestEvent) {
	const actor = requireSystemAdminApi(locals.user);
	const calendarId = parseId(params.id);
	const id = parseId(params.entryId);
	const data = parseWorkCalendarEntryInput(await request.json().catch(() => null));
	if (!calendarId || !id || !data) return failure(400, 'INVALID_REQUEST', 'Invalid calendar entry data.');
	try {
		const item = await getPrisma().$transaction(async (tx) => {
			const calendar = await tx.workCalendar.findFirst({ where: { id: calendarId, deletedAt: null }, select: { calendarYear: true } });
			if (!calendar) return null;
			if (!workDateIsInCalendarYear(data.workDate, calendar.calendarYear)) return 'outside_year' as const;
			const changed = await tx.workCalendarDay.updateMany({ where: { id, calendarId, deletedAt: null, calendar: { deletedAt: null } }, data });
			if (!changed.count) return null;
			await writeAuditLog(tx, actor.id, 'update', 'work_calendar_entry', id);
			return tx.workCalendarDay.findUnique({ where: { id } });
		});
		if (item === 'outside_year') return failure(422, 'DATE_OUTSIDE_CALENDAR_YEAR', 'The entry date must be within the calendar year.', [{ field: 'workDate', reason: 'OUT_OF_RANGE' }]);
		return item ? success(item) : failure(404, 'NOT_FOUND', 'Calendar entry not found.');
	} catch (error) {
		if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') return failure(409, 'DUPLICATE_VALUE', 'A calendar entry already exists on this date.', [{ field: 'workDate', reason: 'DUPLICATE_VALUE' }]);
		return failure(400, 'INVALID_REQUEST', 'Invalid calendar entry data.');
	}
}

export async function DELETE({ locals, params }: import('./$types').RequestEvent) {
	const actor = requireSystemAdminApi(locals.user);
	const calendarId = parseId(params.id);
	const id = parseId(params.entryId);
	if (!calendarId || !id) return failure(404, 'NOT_FOUND', 'Calendar entry not found.');
	const deleted = await getPrisma().$transaction(async (tx) => {
		const changed = await tx.workCalendarDay.updateMany({ where: { id, calendarId, deletedAt: null, calendar: { deletedAt: null } }, data: { deletedAt: new Date() } });
		if (!changed.count) return false;
		await writeAuditLog(tx, actor.id, 'delete', 'work_calendar_entry', id);
		return true;
	});
	return deleted ? success({ id, deleted: true }) : failure(404, 'NOT_FOUND', 'Calendar entry not found.');
}
