export type Link = { text: string; href: string };
export type Item = { text: string; icon: string; href?: string; children?: Link[]; badge?: string };
export type MenuGroup = { label: string; items: Item[]; managerOnly?: boolean; systemAdministratorOnly?: boolean };
export type Breadcrumb = { label: string; href?: string };
	export const menus: MenuGroup[] = [
		{ label: 'GENERAL', items: [{ text: 'Dashboards', icon: 'dashboard', children: [{ text: 'Operations', href: '/' }, { text: 'Analytics', href: '/analytics' }, { text: 'Sales', href: '/sales' }, { text: 'System health', href: '/system-health' }] }] },
		{ label: 'ASSET MANAGEMENT', items: [
			{ text: 'Dashboard', icon: 'dashboard', href: '/asset-dashboard' },
			{ text: 'Employees', icon: 'table', href: '/employees' },
			{ text: 'IT Assets', icon: 'dashboard', href: '/it-assets' }
		] },
		{ label: 'SITE MANAGEMENT', managerOnly: true, items: [
			{ text: 'System settings', icon: 'settings', href: '/system-settings' }
		] },
		{ label: 'MASTER MANAGEMENT', managerOnly: true, items: [
			{ text: 'Employment', icon: 'list', children: [
				{ text: 'Departments', href: '/employee-masters/departments' },
				{ text: 'Groups', href: '/employee-masters/employee-groups' },
				{ text: 'Positions', href: '/employee-masters/positions' },
				{ text: 'Types', href: '/employee-masters/employment-types' }
			] },
			{ text: 'Locations', icon: 'list', children: [
				{ text: 'Branches', href: '/branches' },
				{ text: 'Rooms', href: '/rooms' },
				{ text: 'Storages', href: '/storages' }
			] },
			{ text: 'IT ASSETS', icon: 'list', children: [
				{ text: 'Asset types', href: '/it-asset-masters/it-asset-types' },
				{ text: 'Manufacturers', href: '/it-asset-masters/manufacturers' },
				{ text: 'CPU types', href: '/it-asset-masters/cpu-types' },
				{ text: 'Operating systems', href: '/it-asset-masters/operating-systems' },
				{ text: 'Asset statuses', href: '/it-asset-masters/it-asset-statuses' }
			] }
		] }
	];

	export function breadcrumbsForPath(path: string, title: string): Breadcrumb[] {
		const breadcrumbs: Breadcrumb[] = [{ label: 'HOME', ...(path === '/' ? {} : { href: '/' }) }];
		for (const group of menus) {
			for (const item of group.items) {
				if (item.href === path) return [...breadcrumbs, { label: group.label }, { label: item.text }];
				const child = item.children?.find((link) => link.href === path);
				if (child) {
					return [...breadcrumbs, { label: group.label }, { label: item.text }, { label: child.text }];
				}
			}
		}
		return [...breadcrumbs, { label: title }];
	}

	export function parentMenuForPath(path: string): string | null {
		for (const group of menus) {
			for (const item of group.items) {
				if (item.children?.some((child) => child.href === path)) return item.text;
			}
		}
		return null;
	}

export function isExpandableMenu(text: string): boolean {
		return menus.some((group) => group.items.some((item) => item.text === text && Boolean(item.children)));
}

	export const roleLabels: Record<string, string> = { system_administrator: 'System Administrator', business_administrator: 'Business Administrator', general_user: 'General User' };
	const svg = (body: string) => `<svg class="nav-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">${body}</svg>`;
	export const icons: Record<string, string> = {
		dashboard: svg('<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="4" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="10" width="7" height="11" rx="1.5"/>'),
		settings: svg('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>'),
		table: svg('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M9 10v9M15 10v9"/>'),
		list: svg('<path d="M4 6h16M4 12h16M4 18h10"/>')
	};
