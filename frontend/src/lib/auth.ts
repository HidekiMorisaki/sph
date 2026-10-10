import type { LocalizationSettings } from '$lib/localization';

export type Capabilities = {
	canManageSystemSettings: boolean;
	canManageAdministration: boolean;
	canManageEmployees: boolean;
	canInviteEmployees: boolean;
	canAssignEmployeeRoles: boolean;
	canManageMasters: boolean;
	canManageBranches: boolean;
	canCreateBranches: boolean;
	canDeleteBranches: boolean;
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
