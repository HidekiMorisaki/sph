import type { ApiErrorDetail } from '$lib/server/api/response';

export const socialLinkPlatforms = ['website', 'blog', 'github', 'linkedin', 'x', 'facebook', 'instagram', 'youtube', 'qiita', 'note'] as const;
export type SocialLinkPlatform = (typeof socialLinkPlatforms)[number];

const platformSet = new Set<string>(socialLinkPlatforms);

export type SocialLinkInput = { platform: SocialLinkPlatform; url: string };
export type SocialLinksInputResult =
	| { success: true; data: SocialLinkInput[] }
	| { success: false; errors: ApiErrorDetail[] };

export function parseSocialLinksInput(value: unknown): SocialLinksInputResult {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return { success: false, errors: [{ reason: 'Enter a valid social links object.' }] };
	}
	const links = (value as Record<string, unknown>).links;
	if (!Array.isArray(links)) return { success: false, errors: [{ field: 'links', reason: 'Enter a valid list of links.' }] };
	if (links.length > socialLinkPlatforms.length) return { success: false, errors: [{ field: 'links', reason: `Enter no more than ${socialLinkPlatforms.length} links.` }] };

	const errors: ApiErrorDetail[] = [];
	const parsed: SocialLinkInput[] = [];
	const seen = new Set<string>();
	for (const [index, item] of links.entries()) {
		const field = `links.${index}`;
		if (!item || typeof item !== 'object' || Array.isArray(item)) {
			errors.push({ field, reason: 'Enter a valid link.' });
			continue;
		}
		const { platform: rawPlatform, url: rawUrl } = item as Record<string, unknown>;
		if (typeof rawPlatform !== 'string' || !platformSet.has(rawPlatform)) {
			errors.push({ field: `${field}.platform`, reason: 'Select a supported site.' });
			continue;
		}
		if (seen.has(rawPlatform)) {
			errors.push({ field: `${field}.platform`, reason: 'Each site can be added only once.' });
			continue;
		}
		seen.add(rawPlatform);
		if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
			errors.push({ field: `${field}.url`, reason: 'Enter a URL.' });
			continue;
		}
		const url = rawUrl.trim();
		if (url.length > 2048) {
			errors.push({ field: `${field}.url`, reason: 'Enter 2048 characters or fewer.' });
			continue;
		}
		try {
			const parsedUrl = new URL(url);
			if ((parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') || !parsedUrl.hostname) throw new Error('unsupported URL');
		} catch {
			errors.push({ field: `${field}.url`, reason: 'Enter a valid HTTP or HTTPS URL.' });
			continue;
		}
		parsed.push({ platform: rawPlatform as SocialLinkPlatform, url });
	}
	return errors.length ? { success: false, errors } : { success: true, data: parsed };
}
