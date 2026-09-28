import { failure } from '$lib/server/api/response';
import { Prisma } from '$lib/server/generated/prisma/client';

export function employeeConflictResponse(error: unknown) {
	if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') return null;
	const diagnostic = `${JSON.stringify(error.meta ?? {})} ${error.message}`;
	if (diagnostic.includes('employee_code') || diagnostic.includes('employeeCode')) {
		return failure(409, 'EMPLOYEE_FIELD_CONFLICT', 'An employee already uses this value.', [
			{ field: 'employeeCode', reason: 'This employee code is already in use.' }
		]);
	}
	if (diagnostic.includes('email')) {
		return failure(409, 'EMPLOYEE_FIELD_CONFLICT', 'An employee already uses this value.', [
			{ field: 'email', reason: 'This email address is already in use.' }
		]);
	}
	return failure(409, 'EMPLOYEE_FIELD_CONFLICT', 'An employee already uses this value.');
}
