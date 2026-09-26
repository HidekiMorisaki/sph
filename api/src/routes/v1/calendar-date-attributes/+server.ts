import { requireAuthenticatedApi } from '$lib/server/api/admin';
import { parseCalendarDateRange } from '$lib/server/api/calendar-date-input';
import { listMeta, parseListQuery } from '$lib/server/api/query';
import { success } from '$lib/server/api/response';
import { getPrisma } from '$lib/server/prisma';

const sortFields = ['calendarDate', 'kind', 'name'] as const;

export async function GET({ locals, url }: import('./$types').RequestEvent) {
	requireAuthenticatedApi(locals.user);
	const query = parseListQuery(url, sortFields, 'calendarDate');
	const { from, to } = parseCalendarDateRange(url);
	const where = { calendarDate: { gte: from, lte: to }, deletedAt: null };
	const [total, items] = await getPrisma().$transaction([
		getPrisma().calendarDateAttribute.count({ where }),
		getPrisma().calendarDateAttribute.findMany({ where, orderBy: [{ [query.sortBy]: query.sortOrder }, { id: 'asc' }], skip: query.offset, take: query.limit })
	]);
	return success(items, 200, listMeta(query, items.length, total));
}
