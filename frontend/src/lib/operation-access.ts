import { getContext } from 'svelte';

/** Display guidance only. The API independently authorizes every operation. */
export function operationAccess(): (code: string, branchId?: number) => boolean {
	return getContext<(code: string, branchId?: number) => boolean>('operation-allowed') ?? (() => false);
}
