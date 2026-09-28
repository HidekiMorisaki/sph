import { requireAuthenticatedApi, writeAuditLog } from '$lib/server/api/admin';
import { employeeConflictResponse } from '$lib/server/api/employee-errors';
import { readEmployeeFields, recordEmployeeChange } from '$lib/server/api/employee-history';
import { parseEmployeeSelfInput } from '$lib/server/api/employee-input';
import { failure, success } from '$lib/server/api/response';
import { getPrisma } from '$lib/server/prisma';

const employeeProfileSelect = {
	id: true,
	firstName: true,
	middleName: true,
	lastName: true,
	nameKana: true,
	birthDate: true,
	gender: true,
	bloodType: true,
	postalCode: true,
	prefecture: true,
	city: true,
	streetAddress: true,
	buildingName: true,
	mobilePhone: true,
	email: true
} as const;

function profileOutput(profile: Awaited<ReturnType<typeof findProfile>>) {
	if (!profile) return null;
	return profile;
}

function findProfile(id: number) {
	return getPrisma().employee.findFirst({ where: { id, deletedAt: null }, select: employeeProfileSelect });
}

export async function GET({ locals }: import('./$types').RequestEvent) {
	const actor = requireAuthenticatedApi(locals.user);
	const profile = profileOutput(await findProfile(actor.id));
	return profile ? success(profile) : failure(404, 'NOT_FOUND', 'Not found.');
}

export async function PATCH({ request, locals }: import('./$types').RequestEvent) {
	const actor = requireAuthenticatedApi(locals.user);
	const parsed = parseEmployeeSelfInput(await request.json().catch(() => null));
	if (!parsed.success) return failure(400, 'VALIDATION_ERROR', 'One or more fields are invalid.', parsed.errors);
	try {
		const result = await getPrisma().$transaction(async (tx) => {
			const previous = await tx.employee.findFirst({ where: { id: actor.id, deletedAt: null }, select: { email: true } });
			if (!previous) return null;
			const before = await readEmployeeFields(tx, actor.id);
			const profile = await tx.employee.update({ where: { id: actor.id }, data: parsed.data, select: employeeProfileSelect });
			if (previous.email !== parsed.data.email) {
				await tx.accountInvitation.updateMany({ where: { employeeId: actor.id, usedAt: null, deletedAt: null }, data: { deletedAt: new Date() } });
			}
			await recordEmployeeChange(tx, actor.id, actor.id, 'update', before, await readEmployeeFields(tx, actor.id));
			await writeAuditLog(tx, actor.id, 'update_self_profile', 'employee', actor.id);
			return profile;
		}, { isolationLevel: 'Serializable' });
		return result ? success(result) : failure(404, 'NOT_FOUND', 'Not found.');
	} catch (error) {
		return employeeConflictResponse(error) ?? failure(400, 'INVALID_REQUEST', 'Invalid request.');
	}
}
