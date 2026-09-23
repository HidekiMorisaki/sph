declare global {
	namespace App {
		interface Error {
			message: string;
			status: 'error';
			responseCode: number;
			error: {
				code: string;
				message: string;
				details: import('$lib/server/api/response').ApiErrorDetail[];
			};
		}
		interface Locals {
			principal: import('$lib/server/auth/types').AuthenticatedPrincipal | null;
			user: import('$lib/server/auth/types').AuthenticatedUser | null;
			session: import('$lib/server/auth/types').AuthenticatedSession | null;
		}
	}
}

export {};
