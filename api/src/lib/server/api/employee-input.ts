import type { ApiErrorDetail } from '$lib/server/api/response';

const genders = new Set(['female', 'male', 'unspecified']);
const bloodTypes = new Set(['A', 'B', 'AB', 'O']);
const removedFields = ['active', 'workEmail', 'loginEmail', 'personalEmail', 'roleCodes'];

type EmployeeInput = {
	employee: {
		employeeCode: string; firstName: string; middleName: string | null; lastName: string; nameKana: string | null;
		birthDate: Date; gender: string; bloodType: string | null; postalCode: string | null; prefecture: string | null;
		city: string | null; streetAddress: string | null; buildingName: string | null; mobilePhone: string | null; email: string;
		hiredAt: Date; groupId: number | null;
		employmentTypeId: number; branchId: number; retiredAt: Date | null; notes: string | null;
	};
	departmentIds: number[];
	primaryDepartmentId: number | null;
	positionIds: number[];
	primaryPositionId: number | null;
	roleIds: number[];
};

export type EmployeeSelfInput = Pick<EmployeeInput['employee'],
	'firstName' | 'middleName' | 'lastName' | 'nameKana' | 'birthDate' | 'gender' | 'bloodType' |
	'postalCode' | 'prefecture' | 'city' | 'streetAddress' | 'buildingName' | 'mobilePhone' | 'email'
>;

export type EmployeeInputResult =
	| { success: true; data: EmployeeInput }
	| { success: false; errors: ApiErrorDetail[] };

export type EmployeeSelfInputResult =
	| { success: true; data: EmployeeSelfInput }
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

function readIds(body: Record<string, unknown>, key: string, errors: ApiErrorDetail[]) {
	const raw = body[key];
	if (raw === undefined) return null;
	if (!Array.isArray(raw)) { invalid(errors, key, 'Select valid options.'); return []; }
	const ids = raw.map((value) => typeof value === 'number' ? value : typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN);
	if (ids.some((id) => !Number.isSafeInteger(id) || id <= 0)) invalid(errors, key, 'Select valid options.');
	else if (new Set(ids).size !== ids.length) invalid(errors, key, 'Do not select the same option more than once.');
	return ids.filter((id) => Number.isSafeInteger(id) && id > 0);
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
	const legacyDepartmentId = readId(body, 'departmentId', false, errors);
	const parsedDepartmentIds = readIds(body, 'departmentIds', errors);
	const departmentIds = parsedDepartmentIds ?? (legacyDepartmentId === null ? [] : [legacyDepartmentId]);
	let primaryDepartmentId = Object.hasOwn(body, 'primaryDepartmentId') ? readId(body, 'primaryDepartmentId', false, errors) : legacyDepartmentId ?? departmentIds[0] ?? null;
	if (departmentIds.length === 0) primaryDepartmentId = null;
	else if (primaryDepartmentId === null || !departmentIds.includes(primaryDepartmentId)) invalid(errors, 'primaryDepartmentId', 'Select a primary department from the selected departments.');
	if (parsedDepartmentIds !== null && Object.hasOwn(body, 'departmentId') && legacyDepartmentId !== primaryDepartmentId) invalid(errors, 'departmentId', 'The legacy department must match the primary department.');
	const groupId = readId(body, 'groupId', false, errors);
	const legacyPositionId = readId(body, 'positionId', false, errors);
	const parsedPositionIds = readIds(body, 'positionIds', errors);
	const positionIds = parsedPositionIds ?? (legacyPositionId === null ? [] : [legacyPositionId]);
	let primaryPositionId = Object.hasOwn(body, 'primaryPositionId') ? readId(body, 'primaryPositionId', false, errors) : legacyPositionId ?? positionIds[0] ?? null;
	if (positionIds.length === 0) primaryPositionId = null;
	else if (primaryPositionId === null || !positionIds.includes(primaryPositionId)) invalid(errors, 'primaryPositionId', 'Select a primary position from the selected positions.');
	if (parsedPositionIds !== null && Object.hasOwn(body, 'positionId') && legacyPositionId !== primaryPositionId) invalid(errors, 'positionId', 'The legacy position must match the primary position.');
	const employmentTypeId = readId(body, 'employmentTypeId', true, errors);
	const branchId = readId(body, 'branchId', true, errors);
	const retiredAt = readDate(body, 'retiredAt', false, errors);
	if (retiredAt && hiredAt && retiredAt < hiredAt) invalid(errors, 'retiredAt', 'Retirement date cannot be before hire date.');
	const notes = readText(body, 'notes', 5000, false, errors);

	const parsedRoleIds = readIds(body, 'roleIds', errors);
	const roleIds = parsedRoleIds ?? [];
	if (!parsedRoleIds || roleIds.length === 0) invalid(errors, 'roleIds', 'Select at least one role.');

	if (errors.length || !employeeCode || !firstName || !lastName || !birthDate || !gender || !email || !hiredAt || !employmentTypeId || !branchId) {
		return { success: false, errors };
	}
	return {
		success: true,
		data: {
			employee: { employeeCode, firstName, middleName, lastName, nameKana, birthDate, gender, bloodType, postalCode, prefecture, city, streetAddress, buildingName, mobilePhone, email: email.toLowerCase(), hiredAt, groupId, employmentTypeId, branchId, retiredAt, notes },
			departmentIds,
			primaryDepartmentId,
			positionIds,
			primaryPositionId,
			roleIds
		}
	};
}

const selfEditableFields = new Set([
	'firstName', 'middleName', 'lastName', 'nameKana', 'birthDate', 'gender', 'bloodType',
	'postalCode', 'prefecture', 'city', 'streetAddress', 'buildingName', 'mobilePhone', 'email'
]);

export function parseEmployeeSelfInput(value: unknown): EmployeeSelfInputResult {
	const errors: ApiErrorDetail[] = [];
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return { success: false, errors: [{ reason: 'Enter a valid employee profile object.' }] };
	}
	const body = value as Record<string, unknown>;
	for (const field of Object.keys(body)) {
		if (!selfEditableFields.has(field)) invalid(errors, field, 'This field cannot be changed in your profile.');
	}

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

	if (errors.length || !firstName || !lastName || !birthDate || !gender || !email) return { success: false, errors };
	return {
		success: true,
		data: { firstName, middleName, lastName, nameKana, birthDate, gender, bloodType, postalCode, prefecture, city, streetAddress, buildingName, mobilePhone, email: email.toLowerCase() }
	};
}
