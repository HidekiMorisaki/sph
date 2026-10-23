import { permissionDependencies, derivedPermissionCodes } from './permission-dependencies';
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
].filter(({ code }) => !derivedPermissionCodes.has(code));

export const ownBranchOperations = new Set([
	'employees.skills.create', 'employees.skills.update', 'employees.skills.delete', 'employees.participations.create', 'employees.participations.update', 'employees.participations.delete', 'teams.members.add', 'teams.members.remove',
	'employees.read', 'employees.manage', 'employees.create', 'employees.update', 'employees.delete', 'employees.invite',
	'masters.read', 'branches.manage', 'branches.update', 'branches.delete',
	'rooms.create', 'rooms.update', 'rooms.delete', 'storage.create', 'storage.update', 'storage.delete',
	'assets.read', 'assets.manage', 'assets.create', 'assets.update', 'assets.delete', 'assets.assign', 'assets.return',
	'assets.credentials.read', 'assets.credentials.write', 'assets.credentials.view', 'assets.credentials.update', 'assets.credentials.access',
	'books.manage', 'books.copies.create', 'books.copies.update', 'books.copies.delete', 'books.purchases.manage', 'books.loans.create', 'books.loans.return',
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

export function operationScopesFor(user: AuthenticatedUser): Record<string, 'global' | 'own_branch'> {
 const scopes: Record<string, 'global' | 'own_branch'> = {};
 for (const code of new Set([...user.permissionOperations, ...(user.ownBranchPermissionOperations ?? [])])) {
  const pending = [code], seen = new Set<string>();
  let valid = true, ownBranch = false;
  while (pending.length) {
   const current = pending.shift()!;
   if (seen.has(current)) continue;
   seen.add(current);
   const global = user.permissionOperations.includes(current);
   if (!global && !user.ownBranchPermissionOperations?.includes(current)) { valid = false; break; }
   if (!global) ownBranch = true;
   for (const dependency of permissionDependencies(current, global ? 'global' : 'own_branch')) {
    if (dependency.scopeType === 'global' && !ownBranchOperations.has(dependency.code) && !user.permissionOperations.includes(dependency.code)) { valid = false; break; }
    pending.push(dependency.code);
   }
  }
  if (valid) scopes[code] = ownBranch ? 'own_branch' : 'global';
 }
 return scopes;
}

export function capabilitiesFor(user: AuthenticatedUser) {
	const scopes = operationScopesFor(user);
	return {
		canReadFinancialInformation: Boolean(scopes['financial.read']),
		operationScopes: scopes,
		widgetDraftOperations:Object.keys(scopes).filter(code=>code.startsWith('widgets.drafts.')),
		canReadWidgetDrafts: hasPermissionOperation(user,'widgets.read')&&hasPermissionOperation(user,'widgets.drafts.read'),
		canReadSkills: hasPermissionOperation(user, 'skills.read'),
		canReadProjects: hasPermissionOperation(user, 'projects.read'),
        canReadClients: hasPermissionOperation(user, 'clients.read'),
		workforceOperations: Object.keys(scopes).filter(code => code.startsWith('skills.') || code.startsWith('projects.') || code.startsWith('clients.')),
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
		canAssignCalendars: Boolean(scopes['calendars.assign']),
		canManageAssets: hasPermissionOperation(user, permissionOperations.assetManagement) || hasOwnBranchPermissionOperation(user, permissionOperations.assetManagement),
		canReadAssets: hasPermissionOperation(user, permissionOperations.assetRead) || hasOwnBranchPermissionOperation(user, permissionOperations.assetRead),
		canReadAssetCredentials: Boolean(scopes['assets.credentials.view']),
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
