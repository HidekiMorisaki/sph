import type { AuthenticatedUser } from './types';

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
	{ code: permissionOperations.employeeManagement, category: 'employees' },
	{ code: permissionOperations.masterRead, category: 'masters' },
	{ code: permissionOperations.masterManagement, category: 'masters' },
	{ code: permissionOperations.branchManagement, category: 'masters' },
	{ code: permissionOperations.calendarRead, category: 'calendars' },
	{ code: permissionOperations.calendarAssignment, category: 'calendars' },
	{ code: permissionOperations.roleRead, category: 'system' },
	{ code: permissionOperations.assetRead, category: 'assets' },
	{ code: permissionOperations.assetManagement, category: 'assets' },
	{ code: permissionOperations.assetCredentialRead, category: 'assets' },
	{ code: permissionOperations.assetCredentialWrite, category: 'assets' }
] as const;

export function hasPermissionOperation(user: AuthenticatedUser, operation: string): boolean {
	return user.permissionOperations.includes(operation);
}

export function capabilitiesFor(user: AuthenticatedUser) {
	return {
		canManageSystemSettings: hasPermissionOperation(user, permissionOperations.systemManagement),
		canManageAdministration: hasPermissionOperation(user, permissionOperations.employeeManagement) || hasPermissionOperation(user, permissionOperations.masterManagement),
		canManageEmployees: hasPermissionOperation(user, permissionOperations.employeeManagement),
		canManageMasters: hasPermissionOperation(user, permissionOperations.masterManagement),
		canManageBranches: hasPermissionOperation(user, permissionOperations.systemManagement) && hasPermissionOperation(user, permissionOperations.branchManagement),
		canReadCalendars: hasPermissionOperation(user, permissionOperations.calendarRead),
		canAssignCalendars: hasPermissionOperation(user, permissionOperations.systemManagement) && hasPermissionOperation(user, permissionOperations.calendarAssignment),
		canManageAssets: hasPermissionOperation(user, permissionOperations.assetManagement),
		canReadAssetCredentials: hasPermissionOperation(user, permissionOperations.assetCredentialRead),
		canWriteAssetCredentials: hasPermissionOperation(user, permissionOperations.assetCredentialWrite)
	};
}
