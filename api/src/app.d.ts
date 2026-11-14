declare global {
	namespace App {
		interface Error {
			message: string;
			status: number;
			responseCode?: number;
			error?: {
				code: string;
				message: string;
				details: import('#lib/server/api/response.js').ApiErrorDetail[];
			};
		}
		interface Locals {
			principal: import('#lib/server/auth/types.js').AuthenticatedPrincipal | null;
			user: import('#lib/server/auth/types.js').AuthenticatedUser | null;
			session: import('#lib/server/auth/types.js').AuthenticatedSession | null;
		}
	}
}

export {};
