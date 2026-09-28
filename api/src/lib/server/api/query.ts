import { throwApiError } from './response';

export const DEFAULT_LIMIT = 100;
export const MAX_LIMIT = 500;

export function parseSearch(url: URL): string {
	const search = (url.searchParams.get('search') ?? '').trim();
	if (search.length > 255) {
		throwApiError(422, 'INVALID_SEARCH', 'Search must be 255 characters or fewer.', [
			{ field: 'search', reason: 'OUT_OF_RANGE' }
		]);
	}
	return search;
}

export type SortOrder = 'asc' | 'desc';

export type ListQuery<TSort extends string> = {
	offset: number;
	limit: number;
	sortBy: TSort;
	sortOrder: SortOrder;
};

function unsignedInteger(value: string | null, fallback: number, field: string): number {
	if (value === null) return fallback;
	if (!/^\d+$/.test(value)) {
		throwApiError(422, `INVALID_${field.toUpperCase()}`, `${field} must be a non-negative integer.`, [
			{ field, reason: 'INVALID_INTEGER' }
		]);
	}
	const result = Number(value);
	if (!Number.isSafeInteger(result)) {
		throwApiError(422, `INVALID_${field.toUpperCase()}`, `${field} is too large.`, [
			{ field, reason: 'OUT_OF_RANGE' }
		]);
	}
	return result;
}

export function parseListQuery<const TSort extends readonly string[]>(
	url: URL,
	allowedSortFields: TSort,
	defaultSort: TSort[number]
): ListQuery<TSort[number]> {
	const offset = unsignedInteger(url.searchParams.get('offset'), 0, 'offset');
	const limit = unsignedInteger(url.searchParams.get('limit'), DEFAULT_LIMIT, 'limit');
	if (limit < 1 || limit > MAX_LIMIT) {
		throwApiError(422, 'INVALID_LIMIT', `limit must be between 1 and ${MAX_LIMIT}.`, [
			{ field: 'limit', reason: 'OUT_OF_RANGE' }
		]);
	}

	const requestedSort = url.searchParams.get('sortBy') ?? defaultSort;
	if (!allowedSortFields.includes(requestedSort)) {
		throwApiError(422, 'INVALID_SORT_FIELD', 'sortBy is not supported for this resource.', [
			{ field: 'sortBy', reason: 'UNSUPPORTED_VALUE' }
		]);
	}

	const requestedOrder = (url.searchParams.get('sortOrder') ?? 'asc').toLowerCase();
	if (requestedOrder !== 'asc' && requestedOrder !== 'desc') {
		throwApiError(422, 'INVALID_SORT_ORDER', 'sortOrder must be asc or desc.', [
			{ field: 'sortOrder', reason: 'UNSUPPORTED_VALUE' }
		]);
	}

	return {
		offset,
		limit,
		sortBy: requestedSort as TSort[number],
		sortOrder: requestedOrder
	};
}

export function listMeta<TSort extends string>(query: ListQuery<TSort>, returned: number, total: number) {
	return {
		offset: query.offset,
		limit: query.limit,
		returned,
		total,
		hasMore: query.offset + returned < total,
		sort: { field: query.sortBy, order: query.sortOrder }
	};
}
