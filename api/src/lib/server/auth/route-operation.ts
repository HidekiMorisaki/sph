const routes: Record<string, Partial<Record<string, string>>> = {
	'/v1/employees': { POST: 'employees.create' },
	'/v1/employees/[id]': { PATCH: 'employees.update', DELETE: 'employees.delete' },
	'/v1/employees/[id]/invitations': { POST: 'employees.invite' },
	'/v1/rooms': { POST: 'rooms.create' },
	'/v1/rooms/[id]': { PATCH: 'rooms.update', DELETE: 'rooms.delete' },
	'/v1/storage': { POST: 'storage.create' },
	'/v1/storage/[id]': { PATCH: 'storage.update', DELETE: 'storage.delete' },
	'/v1/it-assets': { POST: 'assets.create' },
	'/v1/it-assets/[id]': { PATCH: 'assets.update', DELETE: 'assets.delete' },
	'/v1/it-assets/[id]/assignments': { POST: 'assets.assign' },
	'/v1/it-assets/[id]/assignments/[assignmentId]': { PATCH: 'assets.return' },
	'/v1/it-assets/[id]/credential-accesses': { POST: 'assets.credentials.access' },
	'/v1/it-assets/[id]/credentials': { GET: 'assets.credentials.view' },
	'/v1/it-assets/[id]/credentials/[type]': { GET: 'assets.credentials.view', PUT: 'assets.credentials.update', DELETE: 'assets.credentials.update' },
	'/v1/it-asset-orders/[resource]': { PUT: 'assets.reorder' },
	'/v1/roles': { POST: 'roles.create' },
	'/v1/roles/[id]': { PATCH: 'roles.update', DELETE: 'roles.delete' },
	'/v1/roles/[id]/permissions': { PUT: 'roles.permissions.update' },
	'/v1/work-calendars': { POST: 'calendars.create' },
	'/v1/work-calendars/[id]': { PATCH: 'calendars.update', DELETE: 'calendars.delete' },
	'/v1/work-calendars/[id]/employees': { PUT: 'calendars.assign' },
	'/v1/work-calendars/[id]/entries': { POST: 'calendars.entries.create' },
	'/v1/work-calendars/[id]/entries/[entryId]': { PATCH: 'calendars.entries.update', DELETE: 'calendars.entries.delete' },
	'/v1/calendar-holiday-imports': { POST: 'calendars.holidays.import' },
	'/v1/financial-periods/[branchId]/[year]/months': { GET: 'financial.read', PUT: 'financial.update' },
	'/v1/financial-periods': { GET: 'financial.read' },
	'/v1/financial-periods/[branchId]/[year]/preview': { POST: 'financial.preview' },
	'/v1/financial-periods/[branchId]/[year]/publication': { PUT: 'financial.publish' },
	'/v1/financial-period-settings': { PATCH: 'financial.settings.update' },
	'/v1/financial-exchange-rates': { POST: 'financial.rates.refresh' },
	'/v1/external-links': { POST: 'system.links.create' },
	'/v1/external-links/[id]': { PATCH: 'system.links.update', DELETE: 'system.links.delete' },
	'/v1/location-orders/[resource]': { PUT: 'masters.reorder' },
	'/v1/workforce-orders/[resource]': { PUT: 'masters.reorder' }
};

export function granularOperationForRoute(routeId: string | null, method: string, params: Record<string, string>): string | null {
	if (!routeId) return null;
	if (routeId === '/v1/[master]' && method === 'POST') return params.master === 'branches' ? 'branches.create' : 'masters.create';
	if (routeId === '/v1/[master]/[id]' && (method === 'PATCH' || method === 'DELETE')) {
		return `${params.master === 'branches' ? 'branches' : 'masters'}.${method === 'PATCH' ? 'update' : 'delete'}`;
	}
	if (routeId === '/v1/system-setting-orders/[resource]' && method === 'PUT') {
		return params.resource === 'external-links' ? 'system.links.reorder' : 'roles.update';
	}
	return routes[routeId]?.[method] ?? null;
}
