import { failure, success } from '$lib/server/api/response';

export function GET({ locals }: import('./$types').RequestEvent) {
	if (!locals.user) {
		return failure(401, 'AUTHENTICATION_REQUIRED', 'Authentication is required.');
	}

	return success({
		user: {
			id: locals.user.id,
			username: locals.user.username,
			email: locals.user.email,
			name: locals.user.name,
			role: locals.user.role,
			roles: locals.user.roles,
			mustChangeCredentials: locals.user.mustChangeCredentials
		}
	});
}
