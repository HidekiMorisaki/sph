function normalize(value: unknown): unknown {
	if (Array.isArray(value)) {
		const normalized = value.map(normalize);
		return normalized.every((item) => item == null || ['string', 'number', 'boolean'].includes(typeof item))
			? [...normalized].sort((left, right) => String(left).localeCompare(String(right)))
			: normalized;
	}
	if (value && typeof value === 'object') {
		return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, normalize(item)]));
	}
	return value;
}

export function formSnapshot(value: unknown): string {
	return JSON.stringify(normalize(value));
}
