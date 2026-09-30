import type { ApiErrorDetail } from '$lib/server/api/response';

export type RoleNameInputResult =
	| { success: true; data: { name: string } }
	| { success: false; errors: ApiErrorDetail[] };

export function parseRoleNameInput(value: unknown): RoleNameInputResult {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return { success: false, errors: [{ reason: 'Enter valid role data.' }] };
	}
	const body = value as Record<string, unknown>;
	const name = typeof body.name === 'string' ? body.name.trim() : '';
	if (!name) return { success: false, errors: [{ field: 'name', reason: 'Enter a name.' }] };
	if (name.length > 128) return { success: false, errors: [{ field: 'name', reason: 'Enter 128 characters or fewer.' }] };
	return { success: true, data: { name } };
}
