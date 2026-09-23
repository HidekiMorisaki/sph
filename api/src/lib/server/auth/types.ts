export type AuthenticatedUser = {
	id: number;
	username: string;
	email: string | null;
	name: string | null;
	role: 'system_administrator' | 'business_administrator' | 'general_user';
	roles: string[];
	mustChangeCredentials: boolean;
};

export type AuthenticatedSession = {
	id: number;
	expiresAt: Date;
};

export type AuthenticatedPrincipal = {
	user: AuthenticatedUser;
	authentication: {
		method: 'session';
		credentialId: number;
		expiresAt: Date;
	};
};
