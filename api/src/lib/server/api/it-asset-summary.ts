import { Prisma } from '$lib/server/generated/prisma/client';
import { throwApiError } from './response';

export function assetSummaryDate(now = new Date()): Date {
	const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
	return new Date(`${date}T00:00:00.000Z`);
}

export function unassignedAssetWhere(asOf: Date): Prisma.ItAssetWhereInput {
	return { deletedAt: null, assignments: { none: { deletedAt: null, returnedAt: null } }, OR: [{ disposalOn: null }, { disposalOn: { gt: asOf } }] };
}

// The SQL list paths use the same active-assignment and disposal-date predicates.
export function unassignedAssetSql(asOf: Date): Prisma.Sql {
	return Prisma.sql`(asset.disposal_on IS NULL OR asset.disposal_on > ${asOf}) AND NOT EXISTS (
		SELECT 1 FROM it_asset_assignments current_assignment WHERE current_assignment.asset_id = asset.id
		AND current_assignment.deleted_at IS NULL AND current_assignment.returned_at IS NULL
	)`;
}

export function parseAssetSummaryFilters(url: URL, branchScope: number | null) {
	const raw = url.searchParams.get('unassigned');
	if (url.searchParams.getAll('unassigned').length > 1 || (raw !== null && raw !== 'true' && raw !== 'false')) {
		throwApiError(422, 'INVALID_UNASSIGNED', 'unassigned must be true or false.');
	}
	const branch = url.searchParams.get('branchId');
	if (url.searchParams.getAll('branchId').length > 1 || (branch !== null && (!/^[1-9]\d*$/.test(branch) || !Number.isSafeInteger(Number(branch))))) {
		throwApiError(422, 'INVALID_BRANCH_ID', 'branchId must be a positive integer.');
	}
	const requested = branch === null ? null : Number(branch);
	if (requested !== null && branchScope !== null && requested !== branchScope) throwApiError(403, 'BRANCH_ACCESS_DENIED', 'Branch access is required.');
	return { unassigned: raw === 'true', branchId: requested ?? branchScope, asOf: assetSummaryDate() };
}
