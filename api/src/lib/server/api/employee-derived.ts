const businessDateFormatter = new Intl.DateTimeFormat('en-CA', {
	timeZone: 'Asia/Tokyo',
	year: 'numeric',
	month: '2-digit',
	day: '2-digit'
});

export type LengthOfService = { years: number; months: number };

export function employeeReferenceDate(now = new Date()) {
	const parts = Object.fromEntries(
		businessDateFormatter.formatToParts(now).flatMap((part) => part.type === 'literal' ? [] : [[part.type, Number(part.value)]])
	);
	return new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
}

export function wholeCalendarMonths(start: Date, end: Date) {
	if (end < start) return 0;
	let months = (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + end.getUTCMonth() - start.getUTCMonth();
	if (end.getUTCDate() < start.getUTCDate()) months -= 1;
	return Math.max(0, months);
}

export function employeeDerivedValues(
	employee: { birthDate: Date; hiredAt: Date; retiredAt: Date | null },
	referenceDate = employeeReferenceDate()
) {
	const ageMonths = wholeCalendarMonths(employee.birthDate, referenceDate);
	const serviceEnd = employee.retiredAt && employee.retiredAt < referenceDate ? employee.retiredAt : referenceDate;
	const serviceMonths = wholeCalendarMonths(employee.hiredAt, serviceEnd);
	return {
		age: Math.floor(ageMonths / 12),
		lengthOfService: { years: Math.floor(serviceMonths / 12), months: serviceMonths % 12 } satisfies LengthOfService
	};
}
