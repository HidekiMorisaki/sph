import { requireSystemAdminApi } from '$lib/server/api/admin';
import { ensureBojRates, financialSettings, parseYear, periodMonths } from '$lib/server/api/financial';
import { failure, success } from '$lib/server/api/response';

export async function POST({ locals, request }: import('./$types').RequestEvent) {
	requireSystemAdminApi(locals.user);
	const body = await request.json().catch(() => null) as Record<string, unknown> | null;
	const year = parseYear(String(body?.year ?? ''));
	if (year === null) return failure(400, 'VALIDATION_ERROR', 'Select a valid year.');
	const settings = await financialSettings();
	if (body?.basis !== settings.basis || body?.fiscalStartMonth !== settings.fiscalStartMonth) return failure(409, 'PERIOD_SETTINGS_CHANGED', 'Year settings changed. Reload and try again.');
	try {
		const missingMonths = await ensureBojRates(periodMonths(year, settings));
		return success({ missingMonths });
	} catch {
		return failure(503, 'EXCHANGE_RATE_SERVICE_UNAVAILABLE', 'Unable to retrieve exchange rates. Try again later.');
	}
}
