import { validateSessionToken } from './session';
import type { AuthenticatedPrincipal } from './types';

type AuthenticationInput = {
	sessionToken?: string;
};

export async function authenticateRequest(input: AuthenticationInput): Promise<AuthenticatedPrincipal | null> {
	const result = await validateSessionToken(input.sessionToken);
	if (!result) return null;

	return {
		user: result.user,
		authentication: {
			method: 'session',
			credentialId: result.session.id,
			expiresAt: result.session.expiresAt
		}
	};
}
