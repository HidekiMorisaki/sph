import { requireAuthenticatedApi, requireSystemAdminApi, writeAuditLog } from '$lib/server/api/admin';
import { duplicateField } from '$lib/server/api/database';
import { listMeta, parseListQuery, parseSearch } from '$lib/server/api/query';
import { failure, success } from '$lib/server/api/response';
import { parseWorkCalendarInput } from '$lib/server/api/work-calendar-input';
import type { Prisma } from '$lib/server/generated/prisma/client';
import { getPrisma } from '$lib/server/prisma';

const sortFields = ['id', 'name', 'calendarYear', 'createdAt', 'updatedAt'] as const;

export async function GET({ locals, url }: import('./$types').RequestEvent) {
	requireAuthenticatedApi(locals.user);
	const query = parseListQuery(url, sortFields, 'name');
	const search = parseSearch(url);
	const where: Prisma.WorkCalendarWhereInput = {
		deletedAt: null,
		...(search ? { OR: [{ name: { contains: search, mode: 'insensitive' } }, { description: { contains: search, mode: 'insensitive' } }] } : {})
	};
	const [total, items] = await getPrisma().$transaction([
		getPrisma().workCalendar.count({ where }),
		getPrisma().workCalendar.findMany({
			where,
			select: {
				id: true, name: true, calendarYear: true, scheduledWorkMinutesPerDay: true, description: true, createdAt: true, updatedAt: true,
				_count: { select: { employees: { where: { deletedAt: null } }, entries: { where: { deletedAt: null } } } }
			},
			orderBy: [{ [query.sortBy]: query.sortOrder }, { id: 'asc' }],
			skip: query.offset,
			take: query.limit
		})
	]);
	return success(items.map(({ _count, ...item }) => ({ ...item, employeeCount: _count.employees, entryCount: _count.entries })), 200, listMeta(query, items.length, total));
}

export async function POST({ locals, request }: import('./$types').RequestEvent) {
	const actor = requireSystemAdminApi(locals.user);
	const data = parseWorkCalendarInput(await request.json().catch(() => null));
	if (!data) return failure(400, 'INVALID_REQUEST', 'Invalid work calendar data.');
	try {
		const item = await getPrisma().$transaction(async (tx) => {
			const created = await tx.workCalendar.create({ data });
			await writeAuditLog(tx, actor.id, 'create', 'work_calendar', created.id);
			return created;
		});
		return success(item, 201);
	} catch (error) {
		return duplicateField(error) ? failure(409, 'DUPLICATE_VALUE', 'The calendar name already exists.', [{ field: 'name', reason: 'DUPLICATE_VALUE' }]) : failure(400, 'INVALID_REQUEST', 'Invalid work calendar data.');
	}
}
