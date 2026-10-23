import operations from './granular-operations.json';

export type PermissionScope = { code: string; scopeType: 'global' | 'own_branch' };
export const derivedPermissionCodes = new Set(['employees.manage', 'masters.manage', 'branches.manage', 'assets.manage', 'assets.credentials.read', 'assets.credentials.write', 'software.manage', 'software.keys.read', 'software.keys.write', 'books.manage', 'books.titles.manage']);

/** Existing server prerequisites; these never expand an aggregate into child operations. */
export function permissionDependencies(code: string, scopeType: PermissionScope['scopeType']): PermissionScope[] {
	const result: PermissionScope[] = [];
	const add = (dependency: string, global = false) => { if (dependency !== code) result.push({ code: dependency, scopeType: global ? 'global' : scopeType }); };
	const definition = operations.find(operation => operation.code === code);
	if (definition) {
		const options = Array.isArray(definition.prerequisite) ? definition.prerequisite : [definition.prerequisite];
		if (options.length) add(options.includes('branches.manage') && scopeType === 'own_branch' ? 'branches.manage' : options[0]);
	}
	if (/^employees\./.test(code) && code !== 'employees.read') add('employees.read');
	if (code === 'employees.read' || /^assets\.(create|update)$/.test(code) || /^books\.copies\.(create|update)$/.test(code)) add('masters.read');
	if (code === 'books.loans.create' || code === 'calendars.assign') add('employees.read');
	if (/^teams\./.test(code) && code !== 'teams.read') add('teams.read', true);
	if (/^teams\.members\./.test(code)) add('employees.read');
	if (/^employees\.skills\./.test(code)) add('skills.read', true);
	if (/^employees\.participations\./.test(code)) add('projects.read', true);
	if (/^(skills|clients|projects)\./.test(code) && !code.endsWith('.read')) add(code.split('.')[0] + '.read', true);
	if (/^projects\.(create|update)$/.test(code)) add('clients.read', true);
	if (/^(masters|branches|rooms|storage)\./.test(code) && code !== 'masters.read') add('masters.read');
	if (/^assets\./.test(code) && code !== 'assets.read') add('assets.read');
	if (/^software\./.test(code) && code !== 'software.read') add('software.read', true);
	if (/^books\./.test(code) && code !== 'books.read') add('books.read', true);
	if (/^calendars\./.test(code) && code !== 'calendars.read') add('calendars.read');
	if (/^widgets\.drafts\./.test(code) && code !== 'widgets.drafts.read') add('widgets.drafts.read', true);
	if (code === 'widgets.layout.update') add('widgets.read', true);
	return [...new Map(result.map(entry => [entry.code, entry])).values()];
}

export function normalizePermissionScopes(selected: PermissionScope[]): PermissionScope[] {
	const grants = new Map<string, PermissionScope['scopeType']>();
	const pending = [...selected];
	while (pending.length) {
		const entry = pending.shift()!;
		const current = grants.get(entry.code);
		if (current === 'global' || current === entry.scopeType) continue;
		grants.set(entry.code, entry.scopeType);
		pending.push(...permissionDependencies(entry.code, entry.scopeType));
	}
	return [...grants].map(([code, scopeType]) => ({ code, scopeType })).sort((a, b) => a.code.localeCompare(b.code));
}
