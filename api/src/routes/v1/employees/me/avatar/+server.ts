import { requireAuthenticatedApi, writeAuditLog } from '$lib/server/api/admin';
import { MAX_UPLOAD_BYTES, normalizeAvatarImage } from '$lib/server/api/avatar-image';
import { failure, success } from '$lib/server/api/response';
import { getPrisma } from '$lib/server/prisma';

function avatarResponse(image: Uint8Array | null) {
	const response = success({ image: image ? `data:image/png;base64,${Buffer.from(image).toString('base64')}` : null });
	response.headers.set('cache-control', 'private, no-store');
	return response;
}

export async function GET({ locals }: import('./$types').RequestEvent) {
	const actor = requireAuthenticatedApi(locals.user);
	const avatar = await getPrisma().employeeAvatar.findFirst({
		where: { employeeId: actor.id, deletedAt: null, employee: { deletedAt: null } },
		select: { image: true }
	});
	return avatarResponse(avatar?.image ?? null);
}

export async function PUT({ request, locals }: import('./$types').RequestEvent) {
	const actor = requireAuthenticatedApi(locals.user);
	if (!request.headers.get('content-type')?.toLowerCase().startsWith('multipart/form-data;')) {
		return failure(415, 'UNSUPPORTED_MEDIA_TYPE', 'A PNG image is required.');
	}
	const form = await request.formData().catch(() => null);
	const file = form?.get('image');
	if (!(file instanceof File) || file.type !== 'image/png' || file.size === 0 || file.size > MAX_UPLOAD_BYTES) {
		return failure(400, 'INVALID_IMAGE', 'A cropped PNG image is required.');
	}
	const normalizedImage = normalizeAvatarImage(Buffer.from(await file.arrayBuffer()));
	if (!normalizedImage) return failure(400, 'INVALID_IMAGE', 'A valid 256 by 256 PNG image is required.');
	const result = await getPrisma().$transaction(async (tx) => {
		const employee = await tx.employee.findFirst({ where: { id: actor.id, deletedAt: null }, select: { id: true } });
		if (!employee) return false;
		await tx.employeeAvatar.upsert({
			where: { employeeId: actor.id },
			create: { employeeId: actor.id, image: normalizedImage },
			update: { image: normalizedImage, deletedAt: null }
		});
		await writeAuditLog(tx, actor.id, 'update_self_avatar', 'employee', actor.id);
		return true;
	});
	return result ? avatarResponse(normalizedImage) : failure(404, 'NOT_FOUND', 'Not found.');
}

export async function DELETE({ locals }: import('./$types').RequestEvent) {
	const actor = requireAuthenticatedApi(locals.user);
	const result = await getPrisma().$transaction(async (tx) => {
		const employee = await tx.employee.findFirst({ where: { id: actor.id, deletedAt: null }, select: { id: true } });
		if (!employee) return false;
		const updated = await tx.employeeAvatar.updateMany({ where: { employeeId: actor.id, deletedAt: null }, data: { deletedAt: new Date() } });
		if (updated.count) await writeAuditLog(tx, actor.id, 'delete_self_avatar', 'employee', actor.id);
		return true;
	});
	return result ? avatarResponse(null) : failure(404, 'NOT_FOUND', 'Not found.');
}
