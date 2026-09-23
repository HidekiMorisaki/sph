export function parseId(value: string): number | null {
	if (!/^[1-9]\d*$/.test(value)) return null;
	const id = Number(value);
	return Number.isSafeInteger(id) ? id : null;
}

export function parseBodyId(value: unknown): number | null {
	if (typeof value === 'number') return Number.isSafeInteger(value) && value > 0 ? value : null;
	return typeof value === 'string' ? parseId(value) : null;
}
