export const allBranchesValue = 'all';

export function restoreBranchSelection(saved: string | null, availableIds: string[]): string[] {
	try {
		const parsed: unknown = JSON.parse(saved ?? 'null');
		if (!Array.isArray(parsed) || !parsed.every((value) => typeof value === 'string')) return [allBranchesValue];
		const available = new Set(availableIds);
		const valid = [...new Set(parsed.filter((value) => available.has(value)))];
		return valid.length ? valid : [allBranchesValue];
	} catch {
		return [allBranchesValue];
	}
}

export function nextBranchSelection(current: string[], requested: string[]): string[] {
	if (requested.includes(allBranchesValue) && !current.includes(allBranchesValue)) return [allBranchesValue];
	const selected = requested.filter((value) => value !== allBranchesValue);
	return selected.length ? selected : [allBranchesValue];
}
