import { parseBodyId } from '$lib/server/api/database';

export const WORK_CALENDAR_MIN_YEAR = 2011;
export const WORK_CALENDAR_MAX_YEAR = 9999;

export function parseWorkCalendarInput(value: unknown) {
	if (!value || typeof value !== 'object') return null;
	const body = value as Record<string, unknown>;
	const name = typeof body.name === 'string' ? body.name.trim() : '';
	const calendarYear = typeof body.calendarYear === 'number' ? body.calendarYear : Number.NaN;
	const scheduledWorkMinutesPerDay = typeof body.scheduledWorkMinutesPerDay === 'number' ? body.scheduledWorkMinutesPerDay : Number.NaN;
	if (body.description !== undefined && body.description !== null && typeof body.description !== 'string') return null;
	const description = typeof body.description === 'string' && body.description.trim() ? body.description.trim() : null;
	if (!name || name.length > 128 || !Number.isInteger(calendarYear) || calendarYear < WORK_CALENDAR_MIN_YEAR || calendarYear > WORK_CALENDAR_MAX_YEAR || !Number.isInteger(scheduledWorkMinutesPerDay) || scheduledWorkMinutesPerDay < 15 || scheduledWorkMinutesPerDay > 1440 || scheduledWorkMinutesPerDay % 15 !== 0 || (description?.length ?? 0) > 1000) return null;
	return { name, calendarYear, scheduledWorkMinutesPerDay, description };
}

export function workDateIsInCalendarYear(workDate: Date, calendarYear: number) {
	return workDate.getUTCFullYear() === calendarYear;
}

export const workCalendarEntryTypes = ['working_day', 'company_holiday'] as const;

export function parseWorkCalendarEntryInput(value: unknown) {
	if (!value || typeof value !== 'object') return null;
	const body = value as Record<string, unknown>;
	const workDateValue = typeof body.workDate === 'string' ? body.workDate : '';
	if (!/^\d{4}-\d{2}-\d{2}$/.test(workDateValue)) return null;
	const workDate = new Date(`${workDateValue}T00:00:00.000Z`);
	if (Number.isNaN(workDate.valueOf()) || workDate.toISOString().slice(0, 10) !== workDateValue) return null;
	const entryType = typeof body.entryType === 'string' ? body.entryType : '';
	if (!workCalendarEntryTypes.includes(entryType as (typeof workCalendarEntryTypes)[number])) return null;
	const title = typeof body.title === 'string' ? body.title.trim() : '';
	if (!title || title.length > 128) return null;
	if (body.note !== undefined && body.note !== null && typeof body.note !== 'string') return null;
	const note = typeof body.note === 'string' && body.note.trim() ? body.note.trim() : null;
	if ((note?.length ?? 0) > 5000) return null;
	return { workDate, entryType, title, note };
}

export function parseEmployeeIdsInput(value: unknown): number[] | null {
	if (!value || typeof value !== 'object') return null;
	const body = value as Record<string, unknown>;
	if (!Array.isArray(body.employeeIds)) return null;
	const ids = body.employeeIds.map(parseBodyId);
	if (ids.some((id) => id === null)) return null;
	return [...new Set(ids as number[])];
}
