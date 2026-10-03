import { requireAuthenticatedApi, writeAuditLog } from '$lib/server/api/admin';
import { failure, success } from '$lib/server/api/response';
import { DEFAULT_DISPLAY_LANGUAGE, DEFAULT_TIME_ZONE, isDisplayLanguage, isTimeZone, type DisplayLanguage } from '$lib/server/auth/localization';
import { getPrisma } from '$lib/server/prisma';

function output(settings: { timeZone: string; displayLanguage: string } | null) {
	return {
		timeZone: settings?.timeZone ?? DEFAULT_TIME_ZONE,
		displayLanguage: isDisplayLanguage(settings?.displayLanguage) ? settings.displayLanguage : DEFAULT_DISPLAY_LANGUAGE
	};
}

export async function GET({ locals }: import('./$types').RequestEvent) {
	const actor = requireAuthenticatedApi(locals.user);
	const settings = await getPrisma().employeeSettings.findFirst({
		where: { employeeId: actor.id, deletedAt: null },
		select: { timeZone: true, displayLanguage: true }
	});
	return success(output(settings));
}

export async function PATCH({ request, locals }: import('./$types').RequestEvent) {
	const actor = requireAuthenticatedApi(locals.user);
	const body = await request.json().catch(() => null) as Record<string, unknown> | null;
	const details = [
		...(!isTimeZone(body?.timeZone) ? [{ field: 'timeZone', reason: 'Select a valid time zone.' }] : []),
		...(!isDisplayLanguage(body?.displayLanguage) ? [{ field: 'displayLanguage', reason: 'Select a supported display language.' }] : [])
	];
	if (details.length || !body) return failure(400, 'VALIDATION_ERROR', 'One or more fields are invalid.', details);

	const timeZone = body.timeZone as string;
	const displayLanguage = body.displayLanguage as DisplayLanguage;
	const saved = await getPrisma().$transaction(async (tx) => {
		const existing = await tx.employeeSettings.findUnique({ where: { employeeId: actor.id }, select: { id: true } });
		const item = existing
			? await tx.employeeSettings.update({ where: { id: existing.id }, data: { timeZone, displayLanguage, deletedAt: null }, select: { id: true, timeZone: true, displayLanguage: true } })
			: await tx.employeeSettings.create({ data: { employeeId: actor.id, timeZone, displayLanguage }, select: { id: true, timeZone: true, displayLanguage: true } });
		await writeAuditLog(tx, actor.id, 'update_localization_settings', 'employee_settings', item.id);
		return item;
	});
	return success(output(saved));
}
