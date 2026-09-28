import { requireAuthenticatedApi, requireSystemAdminApi, writeAuditLog } from '$lib/server/api/admin';
import { duplicateField, parseId } from '$lib/server/api/database';
import { failure, success } from '$lib/server/api/response';
import { parseWorkCalendarInput } from '$lib/server/api/work-calendar-input';
import { getPrisma } from '$lib/server/prisma';

export async function GET({ locals, params }: import('./$types').RequestEvent) {
	requireAuthenticatedApi(locals.user);
	const id = parseId(params.id);
	if (!id) return failure(404, 'NOT_FOUND', 'Work calendar not found.');
	const item = await getPrisma().workCalendar.findFirst({
		where: { id, deletedAt: null },
		select: { id: true, name: true, calendarYear: true, scheduledWorkMinutesPerDay: true, description: true, createdAt: true, updatedAt: true }
	});
	return item ? success(item) : failure(404, 'NOT_FOUND', 'Work calendar not found.');
}

export async function PATCH({ locals, params, request }: import('./$types').RequestEvent) {
	const actor = requireSystemAdminApi(locals.user);
	const id = parseId(params.id);
	const data = parseWorkCalendarInput(await request.json().catch(() => null));
	if (!id || !data) return failure(400, 'INVALID_REQUEST', 'Invalid work calendar data.');
	try {
		const item = await getPrisma().$transaction(async (tx) => {
			const existing = await tx.workCalendar.findFirst({ where: { id, deletedAt: null }, select: { calendarYear: true } });
			if (!existing) return null;
			if (existing.calendarYear !== data.calendarYear) return 'year_change' as const;
			const changed = await tx.workCalendar.updateMany({ where: { id, deletedAt: null }, data });
			if (!changed.count) return null;
			await writeAuditLog(tx, actor.id, 'update', 'work_calendar', id);
			return tx.workCalendar.findUnique({ where: { id } });
		});
		if (item === 'year_change') return failure(422, 'CALENDAR_YEAR_IMMUTABLE', 'The calendar year cannot be changed after creation.', [{ field: 'calendarYear', reason: 'IMMUTABLE' }]);
		return item ? success(item) : failure(404, 'NOT_FOUND', 'Work calendar not found.');
	} catch (error) {
		return duplicateField(error) ? failure(409, 'DUPLICATE_VALUE', 'The calendar name already exists.', [{ field: 'name', reason: 'DUPLICATE_VALUE' }]) : failure(400, 'INVALID_REQUEST', 'Invalid work calendar data.');
	}
}

export async function DELETE({ locals, params }: import('./$types').RequestEvent) {
	const actor = requireSystemAdminApi(locals.user);
	const id = parseId(params.id);
	if (!id) return failure(404, 'NOT_FOUND', 'Work calendar not found.');
	const result = await getPrisma().$transaction(async (tx) => {
		if (!await tx.workCalendar.count({ where: { id, deletedAt: null } })) return false;
		const now = new Date();
		await tx.employee.updateMany({ where: { workCalendarId: id, deletedAt: null }, data: { workCalendarId: null } });
		await tx.workCalendarDay.updateMany({ where: { calendarId: id, deletedAt: null }, data: { deletedAt: now } });
		await tx.workCalendar.update({ where: { id }, data: { deletedAt: now } });
		await writeAuditLog(tx, actor.id, 'delete', 'work_calendar', id);
		return true;
	});
	return result ? success({ id, deleted: true }) : failure(404, 'NOT_FOUND', 'Work calendar not found.');
}
