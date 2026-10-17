import type { SearchContext } from './search';
import type { SearchInputField } from './search-field-inputs';
export { searchFieldRange as employeeSearchRange, splitSearchFields as splitEmployeeSearch, searchFieldValue as employeeSearchValue, searchFieldNode as employeeSearchNode } from './search-field-inputs';

export type EmployeeSearchField = SearchInputField;

// Keep the API allowlist and its permissions authoritative. Other related fields
// remain available through the condition editor.
export function employeeSearchFields(contexts: SearchContext[]): EmployeeSearchField[] {
	return contexts.flatMap(context => context.code === 'employee' || context.code === 'account'
		? context.fields.map(field => ({ context: context.code, field, root: context.code === 'employee', numericRange: field.code === 'age', ...(field.code === 'age' ? { rangeUnit: { ja: '歳', en: 'years' }, minimum: '0', step: '1' } : {}) }))
		: ['branch', 'employmentType', 'group', 'departments', 'positions', 'teams', 'roles', 'calendar'].includes(context.code)
			? context.fields.filter(field => field.code === 'selection').map(field => ({ context: context.code, field: { ...field, label: context.label } })) : []);
}
