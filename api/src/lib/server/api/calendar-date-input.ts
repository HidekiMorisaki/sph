import { throwApiError } from './response';

export const CALENDAR_DATA_START = '2011-01-01';

export function parseIsoDate(value: string | null, field: string): Date {
	if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
		throwApiError(422, 'INVALID_DATE', `${field} must use YYYY-MM-DD format.`, [{ field, reason: 'INVALID_DATE' }]);
	}
	const date = new Date(`${value}T00:00:00.000Z`);
	if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value) {
		throwApiError(422, 'INVALID_DATE', `${field} is not a valid date.`, [{ field, reason: 'INVALID_DATE' }]);
	}
	return date;
}

export function parseCalendarDateRange(url: URL) {
	const from = parseIsoDate(url.searchParams.get('from'), 'from');
	const to = parseIsoDate(url.searchParams.get('to'), 'to');
	if (from > to) throwApiError(422, 'INVALID_DATE_RANGE', 'from must be on or before to.', [{ field: 'to', reason: 'INVALID_RANGE' }]);
	if (from < new Date(`${CALENDAR_DATA_START}T00:00:00.000Z`)) {
		throwApiError(422, 'INVALID_DATE_RANGE', `Calendar data is available from ${CALENDAR_DATA_START}.`, [{ field: 'from', reason: 'OUT_OF_RANGE' }]);
	}
	const span = Math.round((to.valueOf() - from.valueOf()) / 86_400_000);
	if (span > 370) throwApiError(422, 'INVALID_DATE_RANGE', 'Date ranges may not exceed 371 days.', [{ field: 'to', reason: 'OUT_OF_RANGE' }]);
	return { from, to };
}
