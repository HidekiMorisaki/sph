export function parseId(value: string): number | null {
	if (!/^[1-9]\d*$/.test(value)) return null;
	const id = Number(value);
	return Number.isSafeInteger(id) ? id : null;
}

export function parseBodyId(value: unknown): number | null {
	if (typeof value === 'number') return Number.isSafeInteger(value) && value > 0 ? value : null;
	return typeof value === 'string' ? parseId(value) : null;
}

export function duplicateField(error: unknown): string | null {
	if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'P2002') return null;
	const meta = 'meta' in error && error.meta && typeof error.meta === 'object' ? error.meta : null;
	const target = meta && 'target' in meta ? meta.target : null;
	const columns = `${Array.isArray(target) ? target.map(String).join(' ') : String(target ?? '')} ${String(error)}`;
	for (const [column, field] of [
		['management_code_prefix', 'managementCodePrefix'],
		['display_name', 'displayName'],
		['model_number', 'modelNumber'],
		['name', 'name'],
		['code', 'code']
	] as const) {
		if (columns.includes(column) || columns.includes(field)) return field;
	}
	return null;
}
