import type { AuthenticatedUser } from './types';
import granularOperations from './granular-operations.json';

export const permissionOperations = {
	systemManagement: 'system.manage',
	employeeRead: 'employees.read',
	employeeManagement: 'employees.manage',
	masterRead: 'masters.read',
	masterManagement: 'masters.manage',
	branchManagement: 'branches.manage',
	calendarRead: 'calendars.read',
	calendarAssignment: 'calendars.assign',
	roleRead: 'roles.read',
	assetRead: 'assets.read',
	assetManagement: 'assets.manage',
	assetCredentialRead: 'assets.credentials.read',
	assetCredentialWrite: 'assets.credentials.write',
	softwareRead: 'software.read',
	softwareManage: 'software.manage',
	softwareKeyRead: 'software.keys.read',
	softwareKeyWrite: 'software.keys.write',
	bookRead: 'books.read',
	bookTitleManage: 'books.titles.manage',
	bookManage: 'books.manage'
} as const;

export const editablePermissionCatalog = [
	{ code: permissionOperations.employeeRead, category: 'employees' },
	{ code: permissionOperations.masterRead, category: 'masters' },
	{ code: permissionOperations.calendarRead, category: 'calendars' },
	{ code: permissionOperations.roleRead, category: 'system' },
	{ code: permissionOperations.assetRead, category: 'assets' },
	{ code: permissionOperations.softwareRead, category: 'software' },
	{ code: permissionOperations.softwareManage, category: 'software' },
	{ code: permissionOperations.softwareKeyRead, category: 'software' },
	{ code: permissionOperations.softwareKeyWrite, category: 'software' },
	{ code: permissionOperations.bookRead, category: 'books' },
	{ code: permissionOperations.bookTitleManage, category: 'books' },
	{ code: permissionOperations.bookManage, category: 'books' },
	...granularOperations.filter((operation) => !operation.systemOnly).map(({ code, category }) => ({ code, category }))
];

export const ownBranchOperations = new Set([
	'employees.skills.create', 'employees.skills.update', 'employees.skills.delete', 'employees.participations.create', 'employees.participations.update', 'employees.participations.delete', 'teams.members.add', 'teams.members.remove',
	'employees.read', 'employees.manage', 'employees.create', 'employees.update', 'employees.delete', 'employees.invite',
	'masters.read', 'branches.manage', 'branches.update', 'branches.delete',
	'rooms.create', 'rooms.update', 'rooms.delete', 'storage.create', 'storage.update', 'storage.delete',
	'assets.read', 'assets.manage', 'assets.create', 'assets.update', 'assets.delete', 'assets.assign', 'assets.return',
	'assets.credentials.read', 'assets.credentials.write', 'assets.credentials.view', 'assets.credentials.update', 'assets.credentials.access',
	'books.manage', 'books.copies.create', 'books.copies.update', 'books.copies.delete', 'books.covers.update', 'books.reservations.manage', 'books.loans.create', 'books.loans.return',
	'calendars.read', 'calendars.assign', 'financial.read', 'financial.update', 'financial.preview', 'financial.publish'
]);

export function hasPermissionOperation(user: AuthenticatedUser, operation: string): boolean {
	return user.permissionOperations.includes(operation) ||
		(['masters.read', 'calendars.read'].includes(operation) && hasOwnBranchPermissionOperation(user, operation));
}

export function hasOwnBranchPermissionOperation(user: AuthenticatedUser, operation: string): boolean {
	return user.ownBranchPermissionOperations?.includes(operation) ?? false;
}

export function hasScopedPermissionOperation(user: AuthenticatedUser, operation: string, branchId: number): boolean {
	return user.permissionOperations.includes(operation) ||
		(hasOwnBranchPermissionOperation(user, operation) && user.branchId === branchId);
}

export function capabilitiesFor(user: AuthenticatedUser) {
	return {
		canReadSkills: hasPermissionOperation(user, 'skills.read'),
		canReadProjects: hasPermissionOperation(user, 'projects.read'),
        canReadClients: hasPermissionOperation(user, 'clients.read'),
		workforceOperations: user.permissionOperations.filter(code => code.startsWith('skills.') || code.startsWith('projects.') || code.startsWith('clients.')),
		canAddTeamMembersGlobally: hasPermissionOperation(user, 'teams.members.add'),
		canRemoveTeamMembersGlobally: hasPermissionOperation(user, 'teams.members.remove'),
		canReadTeams: hasPermissionOperation(user, 'teams.read'),
		canCreateTeams: hasPermissionOperation(user, 'teams.create'),
		canUpdateTeams: hasPermissionOperation(user, 'teams.update'),
		canDeleteTeams: hasPermissionOperation(user, 'teams.delete'),
		canAddTeamMembers: hasPermissionOperation(user, 'teams.members.add') || hasOwnBranchPermissionOperation(user, 'teams.members.add'),
		canRemoveTeamMembers: hasPermissionOperation(user, 'teams.members.remove') || hasOwnBranchPermissionOperation(user, 'teams.members.remove'),
		canManageTeamMembersGlobally: hasPermissionOperation(user, 'teams.members.add') && hasPermissionOperation(user, 'teams.members.remove'),
		canManageSystemSettings: hasPermissionOperation(user, permissionOperations.systemManagement),
		canManageAdministration: hasPermissionOperation(user, permissionOperations.employeeManagement) || hasPermissionOperation(user, permissionOperations.masterManagement) || hasOwnBranchPermissionOperation(user, permissionOperations.employeeManagement),
		canManageEmployees: hasPermissionOperation(user, permissionOperations.employeeManagement) || hasOwnBranchPermissionOperation(user, permissionOperations.employeeManagement),
		canInviteEmployees: hasPermissionOperation(user, 'employees.invite') || hasOwnBranchPermissionOperation(user, 'employees.invite'),
		canAssignEmployeeRoles: hasPermissionOperation(user, permissionOperations.systemManagement) && hasPermissionOperation(user, 'roles.assign'),
		canManageMasters: hasPermissionOperation(user, permissionOperations.masterManagement),
		canManageBranches: (hasPermissionOperation(user, permissionOperations.systemManagement) && hasPermissionOperation(user, permissionOperations.branchManagement)) || hasOwnBranchPermissionOperation(user, permissionOperations.branchManagement),
		canCreateBranches: hasPermissionOperation(user, permissionOperations.systemManagement) && hasPermissionOperation(user, permissionOperations.branchManagement),
		canDeleteBranches: hasPermissionOperation(user, 'branches.delete') || hasOwnBranchPermissionOperation(user, 'branches.delete'),
		canReadCalendars: hasPermissionOperation(user, permissionOperations.calendarRead),
		canAssignCalendars: (hasPermissionOperation(user, permissionOperations.systemManagement) && hasPermissionOperation(user, permissionOperations.calendarAssignment)) || hasOwnBranchPermissionOperation(user, permissionOperations.calendarAssignment),
		canManageAssets: hasPermissionOperation(user, permissionOperations.assetManagement) || hasOwnBranchPermissionOperation(user, permissionOperations.assetManagement),
		canReadAssetCredentials: hasPermissionOperation(user, permissionOperations.assetCredentialRead) || hasOwnBranchPermissionOperation(user, permissionOperations.assetCredentialRead),
		canWriteAssetCredentials: hasPermissionOperation(user, permissionOperations.assetCredentialWrite) || hasOwnBranchPermissionOperation(user, permissionOperations.assetCredentialWrite),
		canReadSoftware: hasPermissionOperation(user, permissionOperations.softwareRead),
		canManageBookTitles: hasPermissionOperation(user, permissionOperations.bookRead) && hasPermissionOperation(user, 'books.titles.create'),
		canRequestBookPurchases: hasPermissionOperation(user, 'books.purchases.create'),
		canUpdateBookTitles: hasPermissionOperation(user, permissionOperations.bookTitleManage) && hasPermissionOperation(user, 'books.titles.update'),
		canManageBooks: hasPermissionOperation(user, permissionOperations.bookManage) || hasOwnBranchPermissionOperation(user, permissionOperations.bookManage),
		canManageBooksGlobally: hasPermissionOperation(user, permissionOperations.bookManage),
		canManageBookCovers: hasPermissionOperation(user, permissionOperations.bookManage) && hasPermissionOperation(user, 'books.covers.update'),
		canManageSoftware: hasPermissionOperation(user, permissionOperations.softwareManage),
		canDeleteSoftwareProducts: hasPermissionOperation(user, permissionOperations.softwareManage) && hasPermissionOperation(user, 'software.products.delete'),
		canDeleteSoftwareContracts: hasPermissionOperation(user, permissionOperations.softwareManage) && hasPermissionOperation(user, 'software.contracts.delete'),
		canReadSoftwareKeys: hasPermissionOperation(user, permissionOperations.softwareKeyRead),
		canWriteSoftwareKeys: hasPermissionOperation(user, permissionOperations.softwareKeyWrite),
		canCreateSoftwareInstallations: hasPermissionOperation(user, permissionOperations.softwareManage) && hasPermissionOperation(user, 'software.installations.create'),
		canEndSoftwareInstallations: hasPermissionOperation(user, permissionOperations.softwareManage) && hasPermissionOperation(user, 'software.installations.end'),
		canCreateSoftwareUsage: hasPermissionOperation(user, permissionOperations.softwareManage) && hasPermissionOperation(user, 'software.usage.create'),
		canEndSoftwareUsage: hasPermissionOperation(user, permissionOperations.softwareManage) && hasPermissionOperation(user, 'software.usage.end')
	};
}
