import type { DisplayCurrency, DisplayLanguage } from './localization';

export type AuthenticatedUser = {
	id: number;
	username: string;
	email: string | null;
	firstName: string;
	middleName: string | null;
	lastName: string;
	roles: Array<{ id: number; name: string }>;
	permissionIdentifiers: string[];
	permissionOperations: string[];
	activeOperation?: string;
	branchId: number;
	ownBranchPermissionOperations: string[];
	timeZone: string;
	displayLanguage: DisplayLanguage;
	displayCurrency: DisplayCurrency;
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
