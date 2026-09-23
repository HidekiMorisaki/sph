import type { ApiErrorDetail } from '$lib/server/api/response';

const genders = new Set(['female', 'male', 'unspecified']);
const bloodTypes = new Set(['A', 'B', 'AB', 'O']);
export const employeeRoleCodes = ['system_administrator', 'business_administrator', 'general_user'] as const;
export type EmployeeRoleCode = (typeof employeeRoleCodes)[number];
const employeeRoleCodeSet = new Set<string>(employeeRoleCodes);
const removedFields = ['active', 'workEmail', 'loginEmail', 'personalEmail'];

type EmployeeInput = {
	employee: {
		employeeCode: string; firstName: string; middleName: string | null; lastName: string; nameKana: string | null;
		birthDate: Date; gender: string; bloodType: string | null; postalCode: string | null; prefecture: string | null;
		city: string | null; streetAddress: string | null; buildingName: string | null; mobilePhone: string | null; email: string;
		hiredAt: Date; departmentId: number | null; groupId: number | null; positionId: number | null;
		employmentTypeId: number; branchId: number; retiredAt: Date | null; notes: string | null;
	};
	roleCodes: EmployeeRoleCode[];
};

export type EmployeeInputResult =
	| { success: true; data: EmployeeInput }
	| { success: false; errors: ApiErrorDetail[] };

function invalid(errors: ApiErrorDetail[], field: string, reason: string) {
	if (!errors.some((error) => error.field === field)) errors.push({ field, reason });
}

function readText(body: Record<string, unknown>, key: string, maximum: number, required: boolean, errors: ApiErrorDetail[]) {
	const raw = body[key];
	if (raw === null || raw === undefined || raw === '') {
		if (required) invalid(errors, key, 'This field is required.');
		return null;
	}
	if (typeof raw !== 'string') {
		invalid(errors, key, 'Enter text.');
		return null;
	}
	const value = raw.trim();
	if (!value) {
		if (required) invalid(errors, key, 'This field is required.');
		return null;
	}
	if (value.length > maximum) {
		invalid(errors, key, `Enter ${maximum} characters or fewer.`);
		return null;
	}
	return value;
}

function readDate(body: Record<string, unknown>, key: string, required: boolean, errors: ApiErrorDetail[]) {
	const value = readText(body, key, 10, required, errors);
	if (!value) return null;
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
		invalid(errors, key, 'Enter a valid date.');
		return null;
	}
	const parsed = new Date(`${value}T00:00:00.000Z`);
	if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
		invalid(errors, key, 'Enter a valid date.');
		return null;
	}
	return parsed;
}

function readId(body: Record<string, unknown>, key: string, required: boolean, errors: ApiErrorDetail[]) {
	const raw = body[key];
	if (raw === null || raw === undefined || raw === '') {
		if (required) invalid(errors, key, 'Select an option.');
		return null;
	}
	const id = typeof raw === 'number' ? raw : typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) : NaN;
	if (!Number.isSafeInteger(id) || id <= 0) {
		invalid(errors, key, 'Select a valid option.');
		return null;
	}
	return id;
}

export function parseEmployeeInput(value: unknown): EmployeeInputResult {
	const errors: ApiErrorDetail[] = [];
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return { success: false, errors: [{ reason: 'Enter a valid employee object.' }] };
	}
	const body = value as Record<string, unknown>;
	for (const field of removedFields) if (Object.hasOwn(body, field)) invalid(errors, field, 'This field is not supported.');

	const employeeCode = readText(body, 'employeeCode', 64, true, errors);
	if (employeeCode && !/^[A-Za-z0-9]{10,64}$/.test(employeeCode)) invalid(errors, 'employeeCode', 'Use 10 to 64 half-width letters and numbers.');
	const firstName = readText(body, 'firstName', 128, true, errors);
	const middleName = readText(body, 'middleName', 128, false, errors);
	const lastName = readText(body, 'lastName', 128, true, errors);
	const nameKana = readText(body, 'nameKana', 255, false, errors);
	const birthDate = readDate(body, 'birthDate', true, errors);
	const gender = readText(body, 'gender', 16, true, errors);
	if (gender && !genders.has(gender)) invalid(errors, 'gender', 'Select a valid gender.');
	const bloodType = readText(body, 'bloodType', 2, false, errors);
	if (bloodType && !bloodTypes.has(bloodType)) invalid(errors, 'bloodType', 'Select a valid blood type.');
	const postalCode = readText(body, 'postalCode', 8, false, errors);
	if (postalCode && !/^\d{3}-?\d{4}$/.test(postalCode)) invalid(errors, 'postalCode', 'Use a Japanese postal code such as 100-0001.');
	const prefecture = readText(body, 'prefecture', 64, false, errors);
	const city = readText(body, 'city', 128, false, errors);
	const streetAddress = readText(body, 'streetAddress', 255, false, errors);
	const buildingName = readText(body, 'buildingName', 255, false, errors);
	const mobilePhone = readText(body, 'mobilePhone', 32, false, errors);
	if (mobilePhone && !/^[+0-9][0-9 ()-]{6,31}$/.test(mobilePhone)) invalid(errors, 'mobilePhone', 'Enter a valid phone number.');
	const email = readText(body, 'email', 254, true, errors);
	if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) invalid(errors, 'email', 'Enter a valid email address.');
	const hiredAt = readDate(body, 'hiredAt', true, errors);
	const departmentId = readId(body, 'departmentId', false, errors);
	const groupId = readId(body, 'groupId', false, errors);
	const positionId = readId(body, 'positionId', false, errors);
	const employmentTypeId = readId(body, 'employmentTypeId', true, errors);
	const branchId = readId(body, 'branchId', true, errors);
	const retiredAt = readDate(body, 'retiredAt', false, errors);
	if (retiredAt && hiredAt && retiredAt < hiredAt) invalid(errors, 'retiredAt', 'Retirement date cannot be before hire date.');
	const notes = readText(body, 'notes', 5000, false, errors);

	const rawRoleCodes = body.roleCodes;
	let roleCodes: EmployeeRoleCode[] = [];
	if (!Array.isArray(rawRoleCodes) || rawRoleCodes.length === 0) invalid(errors, 'roleCodes', 'Select at least one role.');
	else if (rawRoleCodes.some((role) => typeof role !== 'string' || !employeeRoleCodeSet.has(role))) invalid(errors, 'roleCodes', 'Select valid roles.');
	else if (new Set(rawRoleCodes).size !== rawRoleCodes.length) invalid(errors, 'roleCodes', 'Do not select the same role more than once.');
	else roleCodes = rawRoleCodes as EmployeeRoleCode[];

	if (errors.length || !employeeCode || !firstName || !lastName || !birthDate || !gender || !email || !hiredAt || !employmentTypeId || !branchId) {
		return { success: false, errors };
	}
	return {
		success: true,
		data: {
			employee: { employeeCode, firstName, middleName, lastName, nameKana, birthDate, gender, bloodType, postalCode, prefecture, city, streetAddress, buildingName, mobilePhone, email: email.toLowerCase(), hiredAt, departmentId, groupId, positionId, employmentTypeId, branchId, retiredAt, notes },
			roleCodes
		}
	};
}
