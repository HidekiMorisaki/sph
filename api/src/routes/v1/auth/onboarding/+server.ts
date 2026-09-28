import { hashPassword, invalidateSessionToken, SESSION_COOKIE_NAME } from '$lib/server/auth/session';
import { isStrongPassword } from '$lib/server/auth/password';
import { getPrisma } from '$lib/server/prisma';
import { failure, success } from '$lib/server/api/response';

export async function POST({ request, cookies, locals }: import('./$types').RequestEvent) {
	if (!locals.user?.mustChangeCredentials) return failure(403, 'ONBOARDING_NOT_ALLOWED', 'Account setup is not available.');

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return failure(400, 'INVALID_REQUEST', 'Invalid request.');
	}
	if (!body || typeof body !== 'object') return failure(400, 'INVALID_REQUEST', 'Invalid request.');

	const { password } = body as Record<string, unknown>;
	if (typeof password !== 'string' || password.length > 1024 || !isStrongPassword(password)) {
		return failure(400, 'INVALID_REQUEST', 'Invalid request.');
	}

	try {
		const result = await getPrisma().employee.updateMany({
			where: { id: locals.user.id, deletedAt: null, accountStatus: 'active' },
			data: { passwordHash: await hashPassword(password), mustChangeCredentials: false }
		});
		if (result.count !== 1) return failure(400, 'INVALID_REQUEST', 'Invalid request.');
	} catch {
		return failure(400, 'INVALID_REQUEST', 'Invalid request.');
	}

	await invalidateSessionToken(cookies.get(SESSION_COOKIE_NAME));
	cookies.delete(SESSION_COOKIE_NAME, { path: '/' });
	return success({ onboardingCompleted: true });
}
