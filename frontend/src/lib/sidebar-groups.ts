export const sidebarGroupIds = ['dashboard', 'general', 'businessManagement', 'assets', 'masterManagement', 'otherSystems', 'siteManagement'] as const;
export type SidebarGroupId = typeof sidebarGroupIds[number];
export type SidebarGroupState = Partial<Record<SidebarGroupId, boolean>>;
export const sidebarGroupExpanded = (state: SidebarGroupState, id: SidebarGroupId) => state[id] !== false;

export const isSidebarGroupId = (id: string): id is SidebarGroupId => sidebarGroupIds.some(group => group === id);
export const sidebarGroupKey = (employeeId: number) => `asset-sidebar-groups:v1:${employeeId}`;

function validState(value: unknown): SidebarGroupState {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
	return Object.fromEntries(sidebarGroupIds.flatMap(id => {
		const expanded = (value as Record<string, unknown>)[id];
		return typeof expanded === 'boolean' ? [[id, expanded]] : [];
	}));
}

export function readSidebarGroups(employeeId: number, storage?: Pick<Storage, 'getItem'>): SidebarGroupState {
	if (!Number.isSafeInteger(employeeId) || employeeId < 1) return {};
	try { return validState(JSON.parse((storage ?? localStorage).getItem(sidebarGroupKey(employeeId)) ?? '{}')); }
	catch { return {}; }
}

export function saveSidebarGroups(employeeId: number, state: SidebarGroupState, storage?: Pick<Storage, 'setItem'>): void {
	if (!Number.isSafeInteger(employeeId) || employeeId < 1) return;
	try { (storage ?? localStorage).setItem(sidebarGroupKey(employeeId), JSON.stringify(validState(state))); }
	catch { /* Group controls still work when browser persistence is unavailable. */ }
}
