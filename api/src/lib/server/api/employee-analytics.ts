import { throwApiError } from './response';

type AnalyticsEmployee = {
	birthDate: string | null;
	gender: string | null;
	hiredAt: string;
	retiredAt: string | null;
};

export type AnalyticsPeriod = { fromMonth: string; toMonth: string; startDate: string; endDate: string };

export function parseAnalyticsReferenceDate(url: URL, today: string): string {
	const value = url.searchParams.get('referenceDate');
	if (value === null) return today;
	const invalid = (reason: string): never => throwApiError(422, 'INVALID_ANALYTICS_REFERENCE_DATE', 'The analytics reference date is invalid.', [{ field: 'referenceDate', reason }]);
	if (url.searchParams.getAll('referenceDate').length > 1) invalid('DUPLICATE');
	if (!/^(?!0000)\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(value)) invalid('INVALID_DATE');
	const date = new Date(`${value}T00:00:00Z`);
	if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) invalid('INVALID_DATE');
	if (value > today) invalid('FUTURE_DATE');
	return value;
}

export function parseAnalyticsPeriod(url: URL, referenceDate: string): AnalyticsPeriod | undefined {
	const fromMonth = url.searchParams.get('fromMonth');
	const toMonth = url.searchParams.get('toMonth');
	if (fromMonth === null && toMonth === null) return undefined;
	const invalid = (field: string, reason: string): never => throwApiError(422, 'INVALID_ANALYTICS_PERIOD', 'The analytics period is invalid.', [{ field, reason }]);
	for (const [field, value] of [['fromMonth', fromMonth], ['toMonth', toMonth]] as const) {
		if (url.searchParams.getAll(field).length > 1) invalid(field, 'DUPLICATE');
		if (!value || !/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(value)) invalid(field, 'INVALID_MONTH');
		if (value! > referenceDate.slice(0, 7)) invalid(field, 'FUTURE_MONTH');
	}
	if (fromMonth! > toMonth!) invalid('toMonth', 'REVERSED_PERIOD');
	const lastDay = new Date(0);
	lastDay.setUTCFullYear(Number(toMonth!.slice(0, 4)), Number(toMonth!.slice(5)), 0);
	const monthEnd = lastDay.toISOString().slice(0, 10);
	return { fromMonth: fromMonth!, toMonth: toMonth!, startDate: `${fromMonth}-01`, endDate: monthEnd < referenceDate ? monthEnd : referenceDate };
}

// Business dates are ISO date strings, never timestamps in the viewer's time zone.
export function employeeAnalytics(employees: AnalyticsEmployee[], referenceDate: string, period?: AnalyticsPeriod) {
	const year = Number(referenceDate.slice(0, 4));
	const activeAt = (employee: AnalyticsEmployee, date: string) =>
		employee.hiredAt <= date && (!employee.retiredAt || employee.retiredAt > date);
	const active = employees.filter((employee) => activeAt(employee, referenceDate));
	const demographics = period ? employees.filter((employee) => employee.hiredAt <= period.endDate &&
		(!employee.retiredAt || (employee.retiredAt > period.startDate && employee.retiredAt > employee.hiredAt))) : active;
	const ageDate = period?.endDate ?? referenceDate;
	const ageKeys = ['under20', '20s', '30s', '40s', '50s', '60plus', 'unknown'] as const;
	const ageCounts = new Map<string, number>(ageKeys.map((key) => [key, 0]));
	const genderKeys = ['female', 'male', 'unspecified', 'other'] as const;
	const genderCounts = new Map<string, number>(genderKeys.map((key) => [key, 0]));
	for (const employee of demographics) {
		let ageKey: string = 'unknown';
		if (employee.birthDate && employee.birthDate <= ageDate) {
			const birthdayPending = ageDate.slice(5) < employee.birthDate.slice(5);
			const age = Number(ageDate.slice(0, 4)) - Number(employee.birthDate.slice(0, 4)) - Number(birthdayPending);
			ageKey = age < 20 ? 'under20' : age >= 60 ? '60plus' : `${Math.floor(age / 10) * 10}s`;
		}
		ageCounts.set(ageKey, (ageCounts.get(ageKey) ?? 0) + 1);
		const gender = employee.gender?.trim();
		const genderKey = !gender || gender === 'unspecified' ? 'unspecified' : gender === 'female' || gender === 'male' ? gender : 'other';
		genderCounts.set(genderKey, (genderCounts.get(genderKey) ?? 0) + 1);
	}
	const earliestYear = employees.reduce((earliest, employee) => Math.min(earliest, Number(employee.hiredAt.slice(0, 4))), year);
	const fromYear = period ? Number(period.fromMonth.slice(0, 4)) : Math.max(earliestYear, year - 9);
	const toYear = period ? Number(period.toMonth.slice(0, 4)) : year;
	const annualValues = (itemYear: number, startDate: string, endDate: string) => {
		const startingHeadcount = employees.filter((employee) => activeAt(employee, startDate)).length;
		const departures = employees.filter((employee) => employee.retiredAt && employee.retiredAt >= startDate && employee.retiredAt <= endDate).length;
		const hires = employees.filter((employee) => employee.hiredAt >= startDate && employee.hiredAt <= endDate).length;
		return {
			year: itemYear, startDate, endDate, startingHeadcount,
			headcount: employees.filter((employee) => activeAt(employee, endDate)).length,
			hires, departures, turnoverRate: startingHeadcount ? departures / startingHeadcount * 100 : null
		};
	};
	const annual = Array.from({ length: toYear - fromYear + 1 }, (_, index) => {
		const itemYear = fromYear + index;
		const january = `${String(itemYear).padStart(4, '0')}-01-01`;
		const december = `${String(itemYear).padStart(4, '0')}-12-31`;
		const first = period?.startDate && period.startDate > january ? period.startDate : january;
		const last = period?.endDate ?? referenceDate;
		return annualValues(itemYear, first, last < december ? last : december);
	});
	const currentYear = annualValues(year, `${String(year).padStart(4, '0')}-01-01`, referenceDate);
	return {
		referenceDate, fromYear, period: period ?? null, demographicTotal: demographics.length,
		summary: { headcount: active.length, hires: currentYear.hires, departures: currentYear.departures, turnoverRate: currentYear.turnoverRate },
		ageGroups: ageKeys.map((key) => ({ key, count: ageCounts.get(key)! })),
		genders: genderKeys.map((key) => ({ key, count: genderCounts.get(key)! })),
		annual
	};
}
