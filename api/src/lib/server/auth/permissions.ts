import type { AuthenticatedUser } from './types';

export const permissionOperations = {
	systemManagement: 'system.manage',
	administrationManagement: 'administration.manage',
	assetManagement: 'assets.manage'
} as const;

export function hasPermissionOperation(user: AuthenticatedUser, operation: string): boolean {
	return user.permissionOperations.includes(operation);
}

export function capabilitiesFor(user: AuthenticatedUser) {
	return {
		canManageSystemSettings: hasPermissionOperation(user, permissionOperations.systemManagement),
		canManageAdministration: hasPermissionOperation(user, permissionOperations.administrationManagement),
		canManageAssets: hasPermissionOperation(user, permissionOperations.assetManagement)
	};
}
