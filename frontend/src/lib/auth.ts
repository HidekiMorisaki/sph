import type { LocalizationSettings } from '$lib/localization';

export type Capabilities = {
	canManageSystemSettings: boolean;
	canManageAdministration: boolean;
	canManageEmployees: boolean;
	canManageMasters: boolean;
	canManageBranches: boolean;
	canReadCalendars: boolean;
	canAssignCalendars: boolean;
	canManageAssets: boolean;
	canReadAssetCredentials: boolean;
	canWriteAssetCredentials: boolean;
};

export type SessionRole = { id: number; name: string };

export type SessionUser = {
	id: number;
	username: string;
	email: string | null;
	firstName: string;
	middleName: string | null;
	lastName: string;
	roles: SessionRole[];
	capabilities: Capabilities;
} & LocalizationSettings;

export const roleNames = (user: Pick<SessionUser, 'roles'>) => user.roles.map((role) => role.name).join(', ');
