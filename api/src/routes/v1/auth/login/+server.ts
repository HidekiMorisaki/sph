import { SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS, sessionCookieSecure } from '$lib/server/auth/session';
import { authenticateLogin } from '$lib/server/auth/login';
import { failure, success } from '$lib/server/api/response';

function invalidCredentials() {
	return failure(401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
}

export async function POST({ request, cookies, getClientAddress }: import('./$types').RequestEvent) {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return invalidCredentials();
	}

	if (!body || typeof body !== 'object') {
		return invalidCredentials();
	}

	const { identifier, password } = body as Record<string, unknown>;
	if (
		typeof identifier !== 'string' ||
		typeof password !== 'string' ||
		identifier.length > 254 ||
		password.length > 1024
	) {
		return invalidCredentials();
	}

	let result;
	try { result = await authenticateLogin(identifier, password, getClientAddress()); }
	catch {
		const response = failure(503, 'SERVICE_UNAVAILABLE', 'The service is not ready.');
		response.headers.set('Retry-After', '2');
		return response;
	}
	if (result.status === 'limited') {
		const response = failure(429, 'LOGIN_RATE_LIMITED', 'Too many sign-in attempts. Try again after the restriction expires.', [
			{ field: 'login', reason: 'RATE_LIMITED', retryAfterSeconds: result.retryAfterSeconds }
		]);
		response.headers.set('Retry-After', String(result.retryAfterSeconds));
		return response;
	}
	if (result.status === 'invalid') return invalidCredentials();
	const session = result.session;
	cookies.set(SESSION_COOKIE_NAME, session.token, {
		path: '/',
		httpOnly: true,
		secure: sessionCookieSecure(),
		sameSite: 'lax',
		maxAge: SESSION_MAX_AGE_SECONDS
	});

	return success({ authenticated: true });
}
