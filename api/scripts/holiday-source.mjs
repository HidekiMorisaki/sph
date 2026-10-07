export const CABINET_OFFICE_HOLIDAY_CSV_URL = 'https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv';
export const OPM_HOLIDAY_ICS_URL = 'https://www.opm.gov/policy-data-oversight/pay-leave/federal-holidays/holidays.ics';

export class HolidayYearUnavailableError extends Error {}

/** @typedef {{ calendarDate: Date; dateKey: string; name: string }} Holiday */

/** @param {string} csv */
function parseCsvRows(csv) {
	/** @type {string[][]} */
	const rows = [];
	/** @type {string[]} */
	let row = [];
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

/** @param {string} csv @returns {Holiday[]} */
export function parseCabinetOfficeHolidayCsv(csv) {
	const rows = parseCsvRows(csv.replace(/^\uFEFF/, ''));
	if (rows.length < 2 || rows[0].length < 2) throw new Error('The holiday CSV header is invalid.');
	/** @type {Map<string, Holiday>} */
	const unique = new Map();
	for (const row of rows.slice(1)) {
		const dateText = row[0]?.trim();
		const name = row[1]?.trim();
		const match = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(dateText ?? '');
		if (!match || !name || name.length > 128) throw new Error('The holiday CSV contains an invalid row.');
		const dateKey = `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
		const calendarDate = new Date(`${dateKey}T00:00:00.000Z`);
		if (Number.isNaN(calendarDate.valueOf()) || calendarDate.toISOString().slice(0, 10) !== dateKey) throw new Error('The holiday CSV contains an invalid date.');
		if (dateKey >= '2011-01-01') unique.set(dateKey, { calendarDate, dateKey, name });
	}
	const holidays = [...unique.values()].sort((left, right) => left.dateKey.localeCompare(right.dateKey));
	if (!holidays.length) throw new Error('The holiday CSV has no records from 2011 onward.');
	return holidays;
}

/** @param {ArrayBuffer} bytes */
function decodeCsv(bytes) {
	try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
	catch { return new TextDecoder('shift_jis', { fatal: true }).decode(bytes); }
}

/** @param {string} ics @returns {Holiday[]} */
export function parseOpmHolidayIcs(ics) {
	const lines = ics.replace(/\r\n[ \t]/g, '').split(/\r?\n/);
	if (lines[0] !== 'BEGIN:VCALENDAR' || !lines.includes('END:VCALENDAR')) throw new Error('The OPM calendar is invalid.');
	/** @type {Map<string, Holiday>} */
	const unique = new Map();
	/** @type {Record<string, string> | null} */
	let event = null;
	for (const line of lines) {
		if (line === 'BEGIN:VEVENT') { if (event) throw new Error('The OPM calendar has nested events.'); event = {}; continue; }
		if (line === 'END:VEVENT') {
			if (!event) throw new Error('The OPM calendar has an unmatched event.');
			const dateValue = event['DTSTART;VALUE=DATE'];
			const name = event.SUMMARY?.replace(/\\([,;\\nN])/g, (_match, character) => character.toLowerCase() === 'n' ? ' ' : character).trim();
			if (!/^\d{8}$/.test(dateValue ?? '') || !name || name.length > 128) throw new Error('The OPM calendar contains an invalid event.');
			const dateKey = `${dateValue.slice(0, 4)}-${dateValue.slice(4, 6)}-${dateValue.slice(6, 8)}`;
			const calendarDate = new Date(`${dateKey}T00:00:00.000Z`);
			if (Number.isNaN(calendarDate.valueOf()) || calendarDate.toISOString().slice(0, 10) !== dateKey) throw new Error('The OPM calendar contains an invalid date.');
			if (name !== 'Inauguration Day') unique.set(dateKey, { calendarDate, dateKey, name });
			event = null;
			continue;
		}
		if (event) { const colon = line.indexOf(':'); if (colon > 0) event[line.slice(0, colon)] = line.slice(colon + 1); }
	}
	if (event || !unique.size) throw new Error('The OPM calendar has no valid events.');
	return [...unique.values()].sort((left, right) => left.dateKey.localeCompare(right.dateKey));
}

/** @param {'JP' | 'US'} countryCode @param {number} calendarYear @returns {Promise<Holiday[]>} */
export async function fetchHolidayData(countryCode, calendarYear) {
	const sourceUrl = countryCode === 'JP' ? CABINET_OFFICE_HOLIDAY_CSV_URL : OPM_HOLIDAY_ICS_URL;
	const response = await fetch(sourceUrl, {
		headers: { accept: countryCode === 'JP' ? 'text/csv,text/plain;q=0.9,*/*;q=0.1' : 'text/calendar,text/plain;q=0.9,*/*;q=0.1' },
		signal: AbortSignal.timeout(15_000)
	});
	if (!response.ok) throw new Error(`Holiday source returned HTTP ${response.status}.`);
	const bytes = await response.arrayBuffer();
	if (!bytes.byteLength || bytes.byteLength > 1_000_000) throw new Error('Holiday source size is invalid.');
	const holidays = countryCode === 'JP' ? parseCabinetOfficeHolidayCsv(decodeCsv(bytes)) : parseOpmHolidayIcs(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
	const selected = holidays.filter((holiday) => holiday.calendarDate.getUTCFullYear() === calendarYear);
	if (!selected.length) throw new HolidayYearUnavailableError(`The holiday source has no records for ${calendarYear}.`);
	return selected;
}
