import type { RequestHandler } from './$types';
import { requireAuthenticatedApi, writeAuditLog } from '$lib/server/api/admin';
import { parseAnalyticsSelection } from '$lib/server/api/analytics-selection';
import { employeeReferenceDate } from '$lib/server/api/employee-derived';
import { failure, success } from '$lib/server/api/response';
import { getPrisma } from '$lib/server/prisma';

const today = () => employeeReferenceDate().toISOString().slice(0, 10);

export const GET: RequestHandler = async ({ locals, setHeaders }) => {
	const actor = requireAuthenticatedApi(locals.user);
	const settings = await getPrisma().employeeSettings.findFirst({
		where: { employeeId: actor.id, deletedAt: null }, select: { analyticsSelection: true }
	});
	const date = today();
	let selection = null;
	if (settings?.analyticsSelection) {
		try { selection = parseAnalyticsSelection(settings.analyticsSelection, date); }
		catch { /* Invalid or obsolete selections use the initial defaults. */ }
	}
	setHeaders({ 'cache-control': 'private, no-store' });
	return success({ employeeId: actor.id, today: date, selection });
};

export const PATCH: RequestHandler = async ({ request, locals, setHeaders }) => {
	const actor = requireAuthenticatedApi(locals.user);
	// A queued save from a previous login must never be applied to a newly signed-in employee.
	if (request.headers.get('x-settings-owner') !== String(actor.id)) return failure(409, 'SETTINGS_OWNER_CHANGED', 'The signed-in employee has changed.');
	const selection = parseAnalyticsSelection(await request.json().catch(() => null), today());
	await getPrisma().$transaction(async (tx) => {
		const item = await tx.employeeSettings.upsert({
			where: { employeeId: actor.id },
			create: { employeeId: actor.id, analyticsSelection: selection },
			update: { analyticsSelection: selection, deletedAt: null }, select: { id: true }
		});
		await writeAuditLog(tx, actor.id, 'update_employee_analysis_settings', 'employee_settings', item.id);
	});
	setHeaders({ 'cache-control': 'private, no-store' });
	return success({ selection });
};
