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
	assetCredentialWrite: 'assets.credentials.write'
} as const;

export const editablePermissionCatalog = [
	{ code: permissionOperations.employeeRead, category: 'employees' },
	{ code: permissionOperations.masterRead, category: 'masters' },
	{ code: permissionOperations.calendarRead, category: 'calendars' },
	{ code: permissionOperations.roleRead, category: 'system' },
	{ code: permissionOperations.assetRead, category: 'assets' },
	...granularOperations.filter((operation) => !operation.systemOnly).map(({ code, category }) => ({ code, category }))
];

export const ownBranchOperations = new Set([
	'employees.read', 'employees.manage', 'employees.create', 'employees.update', 'employees.delete', 'employees.invite',
	'masters.read', 'branches.manage', 'branches.update', 'branches.delete',
	'rooms.create', 'rooms.update', 'rooms.delete', 'storage.create', 'storage.update', 'storage.delete',
	'assets.read', 'assets.manage', 'assets.create', 'assets.update', 'assets.delete', 'assets.assign', 'assets.return',
	'assets.credentials.read', 'assets.credentials.write', 'assets.credentials.view', 'assets.credentials.update', 'assets.credentials.access',
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
		canWriteAssetCredentials: hasPermissionOperation(user, permissionOperations.assetCredentialWrite) || hasOwnBranchPermissionOperation(user, permissionOperations.assetCredentialWrite)
	};
}
