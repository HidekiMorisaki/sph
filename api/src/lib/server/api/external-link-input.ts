import type { ApiErrorDetail } from '$lib/server/api/response';

export type ExternalLinkInput = { name: string; url: string; sortOrder: number };
export type ExternalLinkInputResult =
	| { success: true; data: ExternalLinkInput }
	| { success: false; errors: ApiErrorDetail[] };

export function parseExternalLinkInput(value: unknown): ExternalLinkInputResult {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return { success: false, errors: [{ reason: 'Enter valid external link data.' }] };
	}
	const body = value as Record<string, unknown>;
	const errors: ApiErrorDetail[] = [];
	const name = typeof body.name === 'string' ? body.name.trim() : '';
	if (!name) errors.push({ field: 'name', reason: 'Enter a name.' });
	else if (name.length > 128) errors.push({ field: 'name', reason: 'Enter 128 characters or fewer.' });

	const rawUrl = typeof body.url === 'string' ? body.url.trim() : '';
	let url = rawUrl;
	if (!rawUrl) errors.push({ field: 'url', reason: 'Enter a URL.' });
	else if (rawUrl.length > 2048) errors.push({ field: 'url', reason: 'Enter 2048 characters or fewer.' });
	else {
		try {
			const parsed = new URL(rawUrl);
			if ((parsed.protocol !== 'https:' && parsed.protocol !== 'http:') || !parsed.hostname) throw new Error('Unsupported URL.');
			if (parsed.username || parsed.password) {
				errors.push({ field: 'url', reason: 'Do not include a username or password in the URL.' });
			} else if (parsed.href.length > 2048) {
				errors.push({ field: 'url', reason: 'Enter 2048 characters or fewer.' });
			} else url = parsed.href;
		} catch {
			errors.push({ field: 'url', reason: 'Enter a valid HTTP or HTTPS URL.' });
		}
	}

	const rawSortOrder = body.sortOrder ?? 9999;
	const sortOrder = typeof rawSortOrder === 'number' ? rawSortOrder : Number.NaN;
	if (!Number.isSafeInteger(sortOrder) || sortOrder < 0 || sortOrder > 2_147_483_647) {
		errors.push({ field: 'sortOrder', reason: 'Enter a whole number from 0 to 2147483647.' });
	}
	return errors.length ? { success: false, errors } : { success: true, data: { name, url, sortOrder } };
}
