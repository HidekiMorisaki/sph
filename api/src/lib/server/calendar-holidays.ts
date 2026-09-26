import { getPrisma } from '$lib/server/prisma';
import { CALENDAR_DATA_START } from '$lib/server/api/calendar-date-input';

export const CABINET_OFFICE_HOLIDAY_CSV_URL = 'https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv';

type Holiday = { calendarDate: Date; dateKey: string; name: string };

function parseCsvRows(csv: string): string[][] {
	const rows: string[][] = [];
	let row: string[] = [];
	let field = '';
	let quoted = false;
	for (let index = 0; index < csv.length; index += 1) {
		const character = csv[index];
		if (character === '"') {
			if (quoted && csv[index + 1] === '"') { field += '"'; index += 1; }
			else quoted = !quoted;
		} else if (character === ',' && !quoted) {
			row.push(field); field = '';
		} else if ((character === '\n' || character === '\r') && !quoted) {
			if (character === '\r' && csv[index + 1] === '\n') index += 1;
			row.push(field); field = '';
			if (row.some((value) => value.trim())) rows.push(row);
			row = [];
		} else field += character;
	}
	if (field || row.length) { row.push(field); if (row.some((value) => value.trim())) rows.push(row); }
	if (quoted) throw new Error('The holiday CSV contains an unterminated quoted field.');
	return rows;
}

export function parseCabinetOfficeHolidayCsv(csv: string): Holiday[] {
	const rows = parseCsvRows(csv.replace(/^\uFEFF/, ''));
	if (rows.length < 2 || rows[0].length < 2) throw new Error('The holiday CSV header is invalid.');
	const unique = new Map<string, Holiday>();
	for (const row of rows.slice(1)) {
		const dateText = row[0]?.trim();
		const name = row[1]?.trim();
		const match = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(dateText ?? '');
		if (!match || !name || name.length > 128) throw new Error('The holiday CSV contains an invalid row.');
		const dateKey = `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
		const calendarDate = new Date(`${dateKey}T00:00:00.000Z`);
		if (Number.isNaN(calendarDate.valueOf()) || calendarDate.toISOString().slice(0, 10) !== dateKey) throw new Error('The holiday CSV contains an invalid date.');
		if (dateKey >= CALENDAR_DATA_START) unique.set(dateKey, { calendarDate, dateKey, name });
	}
	const holidays = [...unique.values()].sort((left, right) => left.dateKey.localeCompare(right.dateKey));
	if (!holidays.length) throw new Error('The holiday CSV has no records from 2011 onward.');
	return holidays;
}

function decodeCsv(bytes: ArrayBuffer): string {
	try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
	catch { return new TextDecoder('shift_jis', { fatal: true }).decode(bytes); }
}

export async function importCabinetOfficeHolidays(actorId: number) {
	try {
		const response = await fetch(CABINET_OFFICE_HOLIDAY_CSV_URL, {
			headers: { accept: 'text/csv,text/plain;q=0.9,*/*;q=0.1' },
			signal: AbortSignal.timeout(15_000)
		});
		if (!response.ok) throw new Error(`Holiday source returned HTTP ${response.status}.`);
		const bytes = await response.arrayBuffer();
		if (!bytes.byteLength || bytes.byteLength > 1_000_000) throw new Error('Holiday source size is invalid.');
		const holidays = parseCabinetOfficeHolidayCsv(decodeCsv(bytes));
		const rangeStart = holidays[0].calendarDate;
		const rangeEnd = holidays[holidays.length - 1].calendarDate;
		return await getPrisma().$transaction(async (tx) => {
			const current = await tx.calendarDateAttribute.findMany({
				where: { kind: 'public_holiday', calendarDate: { gte: rangeStart, lte: rangeEnd }, deletedAt: null },
				select: { id: true, calendarDate: true }
			});
			const importedKeys = new Set(holidays.map((holiday) => holiday.dateKey));
			const obsoleteIds = current.filter((item) => !importedKeys.has(item.calendarDate.toISOString().slice(0, 10))).map((item) => item.id);
			if (obsoleteIds.length) await tx.calendarDateAttribute.updateMany({ where: { id: { in: obsoleteIds } }, data: { deletedAt: new Date() } });
			for (const holiday of holidays) {
				await tx.calendarDateAttribute.upsert({
					where: { calendarDate_kind: { calendarDate: holiday.calendarDate, kind: 'public_holiday' } },
					create: { calendarDate: holiday.calendarDate, kind: 'public_holiday', name: holiday.name, source: 'cabinet_office', sourceUrl: CABINET_OFFICE_HOLIDAY_CSV_URL },
					update: { name: holiday.name, source: 'cabinet_office', sourceUrl: CABINET_OFFICE_HOLIDAY_CSV_URL, deletedAt: null }
				});
			}
			const imported = await tx.calendarHolidayImport.create({ data: { sourceUrl: CABINET_OFFICE_HOLIDAY_CSV_URL, rangeStart, rangeEnd, importedCount: holidays.length, status: 'success' } });
			await tx.auditLog.create({ data: { actorId, action: 'import', resource: 'calendar_holiday_import', resourceId: imported.id } });
			return imported;
		}, { timeout: 30_000 });
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message.slice(0, 500) : 'Holiday import failed.';
		await getPrisma().$transaction(async (tx) => {
			const failed = await tx.calendarHolidayImport.create({ data: { sourceUrl: CABINET_OFFICE_HOLIDAY_CSV_URL, status: 'failed', errorMessage } });
			await tx.auditLog.create({ data: { actorId, action: 'import_failed', resource: 'calendar_holiday_import', resourceId: failed.id } });
		}).catch(() => undefined);
		throw error;
	}
}
