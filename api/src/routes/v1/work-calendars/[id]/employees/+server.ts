import { requireAuthenticatedApi, requireSystemAdminApi, writeAuditLog } from '$lib/server/api/admin';
import { parseId } from '$lib/server/api/database';
import { failure, success } from '$lib/server/api/response';
import { parseEmployeeIdsInput } from '$lib/server/api/work-calendar-input';
import { listMeta, parseListQuery } from '$lib/server/api/query';
import { getPrisma } from '$lib/server/prisma';

const employeeSelect = { id: true, employeeCode: true, firstName: true, middleName: true, lastName: true } as const;
const sortFields = ['employee', 'employeeCode'] as const;

export async function GET({ locals, params, url }: import('./$types').RequestEvent) {
	requireAuthenticatedApi(locals.user);
	const calendarId = parseId(params.id);
	if (!calendarId || !await getPrisma().workCalendar.count({ where: { id: calendarId, deletedAt: null } })) return failure(404, 'NOT_FOUND', 'Work calendar not found.');
	const query = parseListQuery(url, sortFields, 'employee');
	const where = { workCalendarId: calendarId, deletedAt: null };
	const orderBy = query.sortBy === 'employeeCode'
		? [{ employeeCode: query.sortOrder }, { id: 'asc' as const }]
		: [{ lastName: query.sortOrder }, { firstName: query.sortOrder }, { id: 'asc' as const }];
	const [total, employees] = await getPrisma().$transaction([
		getPrisma().employee.count({ where }),
		getPrisma().employee.findMany({ where, select: employeeSelect, orderBy, skip: query.offset, take: query.limit })
	]);
	return success(employees, 200, listMeta(query, employees.length, total));
}

export async function PUT({ locals, params, request }: import('./$types').RequestEvent) {
	const actor = requireSystemAdminApi(locals.user);
	const calendarId = parseId(params.id);
	const employeeIds = parseEmployeeIdsInput(await request.json().catch(() => null));
	if (!calendarId || !employeeIds) return failure(400, 'INVALID_REQUEST', 'Invalid employee assignment data.');
	const result = await getPrisma().$transaction(async (tx) => {
		if (!await tx.workCalendar.count({ where: { id: calendarId, deletedAt: null } })) return 'calendar_not_found' as const;
		const found = await tx.employee.count({ where: { id: { in: employeeIds }, deletedAt: null } });
		if (found !== employeeIds.length) return 'employee_not_found' as const;
		await tx.employee.updateMany({ where: { workCalendarId: calendarId, deletedAt: null, id: { notIn: employeeIds } }, data: { workCalendarId: null } });
		if (employeeIds.length) await tx.employee.updateMany({ where: { id: { in: employeeIds }, deletedAt: null }, data: { workCalendarId: calendarId } });
		await writeAuditLog(tx, actor.id, 'assign_employees', 'work_calendar', calendarId);
		return tx.employee.findMany({ where: { workCalendarId: calendarId, deletedAt: null }, select: employeeSelect, orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { id: 'asc' }] });
	});
	if (result === 'calendar_not_found') return failure(404, 'NOT_FOUND', 'Work calendar not found.');
	if (result === 'employee_not_found') return failure(400, 'INVALID_EMPLOYEE', 'One or more employees do not exist.', [{ field: 'employeeIds', reason: 'NOT_FOUND' }]);
	return success(result);
}
