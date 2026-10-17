import type { SearchContext, SearchDefinition, SearchGroup, SearchNode } from './search';

export const sharedSearchOptions: Record<string, string> = { branch: 'branchIds', teams: 'teamIds' };

export function hasSelectionCondition(node: SearchNode, context: string, active = ''): boolean {
	if (node.kind === 'rule') return active === context && node.field === 'selection';
	return node.children.some(child => hasSelectionCondition(child, context, node.context ?? active));
}

// Convert only a single, standalone positive selector. Complex or conflicting
// predicates remain untouched, including independent groups on the same relation.
export function normalizeSharedOptions(definition: SearchDefinition, contexts: SearchContext[]): SearchDefinition {
	const options = { ...definition.options };
	let conditions: SearchGroup = definition.conditions;
	if (conditions.mode !== 'all' || conditions.context) return definition;
	for (const [context, key] of Object.entries(sharedSearchOptions)) {
		if (!contexts.some(item => item.code === context && item.scope !== 'own_branch' && item.fields.some(field => field.code === 'selection'))) continue;
		const nodes = conditions.children.filter(node => hasSelectionCondition(node, context));
		if (nodes.length !== 1) continue;
		const node = nodes[0];
		if (node.kind !== 'group' || node.context !== context || node.match !== 'some' || node.mode !== 'all' || node.children.length !== 1) continue;
		const rule = node.children[0];
		if (rule.kind !== 'rule' || rule.field !== 'selection' || !['eq', 'in'].includes(rule.operator)) continue;
		const values = rule.operator === 'in' && Array.isArray(rule.value) ? rule.value : rule.operator === 'eq' && typeof rule.value === 'string' ? [rule.value] : [];
		if (!values.length || values.some(value => typeof value !== 'string' || !/^[1-9]\d*$/.test(value))) continue;
		const selection = [...new Set(values)].sort().join(',');
		if (options[key] !== undefined && String(options[key]).split(',').sort().join(',') !== selection) continue;
		options[key] = selection;
		conditions = { ...conditions, children: conditions.children.filter(child => child !== node) };
	}
	return { ...definition, conditions, options };
}
