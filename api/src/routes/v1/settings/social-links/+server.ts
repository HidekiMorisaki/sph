import { requireAuthenticatedApi, writeAuditLog } from '$lib/server/api/admin';
import { failure, success } from '$lib/server/api/response';
import { parseSocialLinksInput, socialLinkPlatforms } from '$lib/server/api/social-links';
import { getPrisma } from '$lib/server/prisma';

const select = { platform: true, url: true } as const;

export async function GET({ locals }: import('./$types').RequestEvent) {
	const actor = requireAuthenticatedApi(locals.user);
	const links = await getPrisma().employeeSocialLink.findMany({
		where: { employeeId: actor.id, deletedAt: null, platform: { in: [...socialLinkPlatforms] } },
		select,
		orderBy: { id: 'asc' }
	});
	const response = success(links);
	response.headers.set('Cache-Control', 'no-store');
	return response;
}

export async function PUT({ request, locals }: import('./$types').RequestEvent) {
	const actor = requireAuthenticatedApi(locals.user);
	const parsed = parseSocialLinksInput(await request.json().catch(() => null));
	if (!parsed.success) return failure(400, 'VALIDATION_ERROR', 'One or more links are invalid.', parsed.errors);

	const links = await getPrisma().$transaction(async (tx) => {
		const now = new Date();
		const activePlatforms = parsed.data.map((link) => link.platform);
		await tx.employeeSocialLink.updateMany({
			where: { employeeId: actor.id, deletedAt: null, platform: { in: [...socialLinkPlatforms], ...(activePlatforms.length ? { notIn: activePlatforms } : {}) } },
			data: { deletedAt: now }
		});
		for (const link of parsed.data) {
			await tx.employeeSocialLink.upsert({
				where: { employeeId_platform: { employeeId: actor.id, platform: link.platform } },
				create: { employeeId: actor.id, platform: link.platform, url: link.url },
				update: { url: link.url, deletedAt: null }
			});
		}
		await writeAuditLog(tx, actor.id, 'update_social_links', 'employee', actor.id);
		return tx.employeeSocialLink.findMany({ where: { employeeId: actor.id, deletedAt: null, platform: { in: [...socialLinkPlatforms] } }, select, orderBy: { id: 'asc' } });
	}, { isolationLevel: 'Serializable' });

	const order = new Map(socialLinkPlatforms.map((platform, index) => [platform, index]));
	links.sort((left, right) => (order.get(left.platform as typeof socialLinkPlatforms[number]) ?? 999) - (order.get(right.platform as typeof socialLinkPlatforms[number]) ?? 999));
	return success(links);
}
