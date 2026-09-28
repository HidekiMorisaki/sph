import { dev } from '$app/environment';
import { createSession, SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS, verifyPassword } from '$lib/server/auth/session';
import { getPrisma } from '$lib/server/prisma';
import { failure, success } from '$lib/server/api/response';

function invalidCredentials() {
	return failure(401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
}

export async function POST({ request, cookies }: import('./$types').RequestEvent) {
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

	const user = await getPrisma().employee.findFirst({
		where: {
			...(identifier.includes('@') ? { email: identifier.trim().toLowerCase() } : { username: identifier.trim() }),
			deletedAt: null,
			accountStatus: 'active',
			OR: [{ retiredAt: null }, { retiredAt: { gt: new Date() } }],
			roleGrants: { some: { deletedAt: null, scopeType: 'global', role: { deletedAt: null } } }
		},
		select: { id: true, passwordHash: true }
	});

	if (!user?.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
		return invalidCredentials();
	}

	const session = await createSession(user.id);
	cookies.set(SESSION_COOKIE_NAME, session.token, {
		path: '/',
		httpOnly: true,
		secure: !dev,
		sameSite: 'lax',
		maxAge: SESSION_MAX_AGE_SECONDS
	});

	return success({ authenticated: true });
}
