import { dev } from '$app/environment';

import { invalidateSessionToken, SESSION_COOKIE_NAME } from '$lib/server/auth/session';
import { success } from '$lib/server/api/response';

export async function POST({ cookies }: import('./$types').RequestEvent) {
	await invalidateSessionToken(cookies.get(SESSION_COOKIE_NAME));
	cookies.delete(SESSION_COOKIE_NAME, {
		path: '/',
		httpOnly: true,
		secure: !dev,
		sameSite: 'lax'
	});

	return success({ authenticated: false });
}
