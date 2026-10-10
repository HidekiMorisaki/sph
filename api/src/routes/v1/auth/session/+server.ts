import { failure, success } from '$lib/server/api/response';
import { capabilitiesFor } from '$lib/server/auth/permissions';

export function GET({ locals }: import('./$types').RequestEvent) {
	if (!locals.user) {
		return failure(401, 'AUTHENTICATION_REQUIRED', 'Authentication is required.');
	}

	return success({
		user: {
			id: locals.user.id,
			username: locals.user.username,
			email: locals.user.email,
			firstName: locals.user.firstName,
			middleName: locals.user.middleName,
			lastName: locals.user.lastName,
			roles: locals.user.roles,
			capabilities: capabilitiesFor(locals.user),
			timeZone: locals.user.timeZone,
			displayLanguage: locals.user.displayLanguage,
			displayCurrency: locals.user.displayCurrency
		}
	});
}
