import type { LocalizationSettings } from '$lib/localization';

export type Capabilities = {
 canReadSkills: boolean;
 canReadProjects: boolean;
 canReadClients: boolean;
 workforceOperations: string[];
 canReadTeams: boolean;
 canCreateTeams: boolean;
 canUpdateTeams: boolean;
 canDeleteTeams: boolean;
 canAddTeamMembers: boolean;
 canRemoveTeamMembers: boolean;
 canManageTeamMembersGlobally: boolean;
 canAddTeamMembersGlobally: boolean;
 canRemoveTeamMembersGlobally: boolean;
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
	canReadSoftware: boolean;
	canManageBookTitles: boolean;
	canRequestBookPurchases: boolean;
	canUpdateBookTitles: boolean;
	canManageBooks: boolean;
	canManageBooksGlobally: boolean;
	canManageBookCovers: boolean;
	canCreateSoftwareInstallations: boolean;
	canEndSoftwareInstallations: boolean;
	canCreateSoftwareUsage: boolean;
	canEndSoftwareUsage: boolean;
};

export type SessionRole = { id: number; name: string };

export type SessionUser = {
	id: number;
	branchId?: number;
	username: string;
	email: string | null;
	firstName: string;
	middleName: string | null;
	lastName: string;
	roles: SessionRole[];
	capabilities: Capabilities;
} & LocalizationSettings;

export const roleNames = (user: Pick<SessionUser, 'roles'>) => user.roles.map((role) => role.name).join(', ');
