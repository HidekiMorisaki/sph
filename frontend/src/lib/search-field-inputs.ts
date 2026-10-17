import { emptyGroup, type SearchField, type SearchGroup, type SearchNode, type SearchRule } from './search';

export type SearchInputField = {
	context: string;
	field: SearchField;
	root?: boolean;
	numericRange?: boolean;
	rangeUnit?: { ja: string; en: string };
	minimum?: string;
	step?: string;
	exampleCode?: string;
};

// Only extract predicates that the individual inputs can faithfully represent.
// OR, repeated, and multi-field related groups stay intact in remaining.
function fieldRule(node: SearchNode, item: SearchInputField): SearchRule | undefined {
	if (item.root === true) return node.kind === 'rule' && node.field === item.field.code ? node : undefined;
	if (node.kind !== 'group' || node.context !== item.context || node.match !== 'some' || node.mode !== 'all' || node.children.length !== 1) return;
	const rule = node.children[0];
	return rule.kind === 'rule' && rule.field === item.field.code ? rule : undefined;
}

export function searchFieldRange(field: SearchField): boolean {
	return field.type === 'date' || field.type === 'datetime';
}

function supported(rule: SearchRule, item: SearchInputField): boolean {
	return (searchFieldRange(item.field) || item.numericRange ? ['between', 'gte', 'lte', ...(item.numericRange ? ['eq'] : [])] : item.field.type === 'string' ? ['contains'] : ['eq']).includes(rule.operator);
}

export function splitSearchFields(group: SearchGroup, fields: SearchInputField[]) {
	const represented = new Map<SearchInputField, SearchNode>();
	const remaining: SearchNode[] = [];
	if (group.mode !== 'all' || group.context) return { represented, remaining: { ...emptyGroup(), children: [group] } };
	for (const node of group.children) {
		const item = fields.find(item => { const rule = fieldRule(node, item); return rule && supported(rule, item); });
		if (item && !represented.has(item)) represented.set(item, node);
		else remaining.push(node);
	}
	return { represented, remaining: { ...emptyGroup(), children: remaining } };
}

export function searchFieldValue(node: SearchNode | undefined, item: SearchInputField): [string, string] {
	const rule = node && fieldRule(node, item);
	if (!rule) return ['', ''];
	if (rule.operator === 'between') return Array.isArray(rule.value) ? [String(rule.value[0]), String(rule.value[1])] : ['', ''];
	if (item.numericRange && rule.operator === 'eq') return [String(rule.value ?? ''), String(rule.value ?? '')];
	return rule.operator === 'lte' ? ['', String(rule.value ?? '')] : [String(rule.value ?? ''), ''];
}

export function searchFieldNode(item: SearchInputField, values: [string, string]): SearchNode | undefined {
	const [from, to] = values;
	if (!from && !to) return;
	const range = searchFieldRange(item.field) || item.numericRange;
	const scalar = (value: string) => item.field.type === 'number' ? Number(value) : value;
	const rule: SearchRule = { kind: 'rule', field: item.field.code,
		operator: range ? from && to ? 'between' : from ? 'gte' : 'lte' : item.field.type === 'string' ? 'contains' : 'eq',
		value: range ? from && to ? [scalar(from), scalar(to)] : scalar(from || to) : item.field.type === 'boolean' ? from === 'true' : scalar(from) };
	return item.root === true ? rule : { ...emptyGroup(), context: item.context, match: 'some', children: [rule] };
}
