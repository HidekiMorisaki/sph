import { getPrisma } from '$lib/server/prisma';
import { CABINET_OFFICE_HOLIDAY_CSV_URL, OPM_HOLIDAY_ICS_URL, HolidayYearUnavailableError, fetchHolidayData } from '../../../scripts/holiday-source.mjs';

export { CABINET_OFFICE_HOLIDAY_CSV_URL, OPM_HOLIDAY_ICS_URL, HolidayYearUnavailableError, parseCabinetOfficeHolidayCsv, parseOpmHolidayIcs } from '../../../scripts/holiday-source.mjs';
export type HolidayCountry = 'JP' | 'US';

export async function importPublicHolidays(actorId: number, calendarYear: number, countryCode: HolidayCountry) {
	const rangeStart = new Date(`${calendarYear}-01-01T00:00:00.000Z`);
	const rangeEnd = new Date(`${calendarYear}-12-31T00:00:00.000Z`);
	const sourceUrl = countryCode === 'JP' ? CABINET_OFFICE_HOLIDAY_CSV_URL : OPM_HOLIDAY_ICS_URL;
	try {
		const holidays = await fetchHolidayData(countryCode, calendarYear);
		return await getPrisma().$transaction(async (tx) => {
			const current = await tx.calendarDateAttribute.findMany({
				where: { countryCode, kind: 'public_holiday', calendarDate: { gte: rangeStart, lte: rangeEnd }, deletedAt: null },
				select: { id: true, calendarDate: true }
			});
			const importedKeys = new Set(holidays.map((holiday) => holiday.dateKey));
			const obsoleteIds = current.filter((item) => !importedKeys.has(item.calendarDate.toISOString().slice(0, 10))).map((item) => item.id);
			if (obsoleteIds.length) await tx.calendarDateAttribute.updateMany({ where: { id: { in: obsoleteIds } }, data: { deletedAt: new Date() } });
			for (const holiday of holidays) {
				await tx.calendarDateAttribute.upsert({
					where: { countryCode_calendarDate_kind: { countryCode, calendarDate: holiday.calendarDate, kind: 'public_holiday' } },
					create: { countryCode, calendarDate: holiday.calendarDate, kind: 'public_holiday', name: holiday.name, source: countryCode === 'JP' ? 'cabinet_office' : 'opm', sourceUrl },
					update: { name: holiday.name, source: countryCode === 'JP' ? 'cabinet_office' : 'opm', sourceUrl, deletedAt: null }
				});
			}
			const imported = await tx.calendarHolidayImport.create({ data: { countryCode, sourceUrl, rangeStart, rangeEnd, importedCount: holidays.length, status: 'success' } });
			await tx.auditLog.create({ data: { actorId, action: 'import', resource: 'calendar_holiday_import', resourceId: imported.id } });
			return imported;
		}, { timeout: 30_000 });
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message.slice(0, 500) : 'Holiday import failed.';
		await getPrisma().$transaction(async (tx) => {
			const failed = await tx.calendarHolidayImport.create({ data: { countryCode, sourceUrl, rangeStart, rangeEnd, status: 'failed', errorMessage } });
			await tx.auditLog.create({ data: { actorId, action: 'import_failed', resource: 'calendar_holiday_import', resourceId: failed.id } });
		}).catch(() => undefined);
		throw error;
	}
}
