import { DEFAULT_LOCALIZATION, type LocalizationSettings } from '$lib/localization';

// Only the session cookie is forwarded to the configured REST API host.
export async function readInitialLocalization(sessionCookie: string | undefined, apiOrigin: string, fetcher: typeof fetch = fetch): Promise<LocalizationSettings> {
	if (!sessionCookie) return { ...DEFAULT_LOCALIZATION };
	const response = await fetcher(new URL('/v1/auth/session', apiOrigin), {
		headers: { cookie: `equipment_session=${encodeURIComponent(sessionCookie)}` },
		cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(5000)
	});
	if (response.status === 401) return { ...DEFAULT_LOCALIZATION };
	if (!response.ok) throw new Error('Unable to load display settings.');
	const payload = await response.json();
	const user = payload?.data?.user;
	if (payload?.status !== 'success' || payload?.responseCode !== 200 || !user ||
		(user.displayLanguage !== 'en' && user.displayLanguage !== 'ja') ||
		(user.displayCurrency !== 'JPY' && user.displayCurrency !== 'USD') || typeof user.timeZone !== 'string') {
		throw new Error('Invalid display settings.');
	}
	try { new Intl.DateTimeFormat('en', { timeZone: user.timeZone }); }
	catch { throw new Error('Invalid display settings.'); }
	return { timeZone: user.timeZone, displayLanguage: user.displayLanguage, displayCurrency: user.displayCurrency };
}
