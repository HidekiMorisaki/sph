import { createHash, randomUUID } from 'node:crypto';
import { Client } from 'pg';

const baseUrl = process.env.API_VERIFY_BASE_URL ?? 'http://localhost:3000';
const origin = process.env.API_VERIFY_ORIGIN ?? baseUrl;
const requestHost = process.env.API_VERIFY_HOST;
const username = process.env.INITIAL_ADMIN_USERNAME;
const password = process.env.INITIAL_ADMIN_PASSWORD;
const configuredEmail = process.env.INITIAL_ADMIN_EMAIL?.trim().toLowerCase();
const verificationDatabaseName = process.env.API_VERIFY_DATABASE_NAME;
if (!username || !password || !configuredEmail || !process.env.DATABASE_URL) throw new Error('API verification prerequisites are unavailable.');
if (!verificationDatabaseName || !/^[a-z][a-z0-9_]*_verify$/.test(verificationDatabaseName)) {
	throw new Error('API verification requires a dedicated database ending in _verify.');
}

const client = new Client({ connectionString: process.env.DATABASE_URL });
let originalMustChange;
let originalRole;
let originalPasswordHash;
let employeeId;
let roleGrantId;
let cookie;

async function request(path, init = {}) {
	return fetch(baseUrl + path, {
		...init,
		headers: { origin, ...(requestHost ? { host: requestHost } : {}), ...(init.headers ?? {}), ...(cookie ? { cookie } : {}) }
	});
}

async function payload(response) {
	const body = await response.json();
	if (body.responseCode !== response.status) throw new Error(`Response code mismatch (${response.status}/${body.responseCode}).`);
	if (body.status !== (response.ok ? 'success' : 'error')) throw new Error(`Response status mismatch (${body.status}).`);
	return body;
}

async function expectEmployeeError(response, status, code, field) {
	const body = await payload(response);
	if (response.status !== status || body.error.code !== code || !body.error.details.some((detail) => detail.field === field && detail.reason)) {
		throw new Error(`Employee ${field} error contract failed (${response.status}/${body.error.code}).`);
	}
	return body;
}

async function expectItAssetError(response, status, code, field) {
	const body = await payload(response);
	if (response.status !== status || body.error.code !== code || !body.error.details.some((detail) => detail.field === field && detail.reason)) {
		throw new Error(`IT asset ${field} error contract failed (${response.status}/${body.error.code}).`);
	}
}

function hasEmergencyContactFields(employee) {
	return ['emergencyContactName', 'emergencyContactRelation', 'emergencyContactPhone'].some((field) => Object.hasOwn(employee, field));
}

function hasRemovedEmployeeFields(employee) {
	return hasEmergencyContactFields(employee) || Object.hasOwn(employee, 'active') ||
		['username', 'loginEmail', 'workEmail', 'personalEmail', 'passwordHash', 'accountStatus', 'mustChangeCredentials'].some((field) => Object.hasOwn(employee, field));
}

function hasEmployeeDerivedFields(employee) {
	return Number.isInteger(employee.age) && employee.age >= 0 &&
		Number.isInteger(employee.lengthOfService?.years) && employee.lengthOfService.years >= 0 &&
		Number.isInteger(employee.lengthOfService?.months) && employee.lengthOfService.months >= 0 && employee.lengthOfService.months <= 11;
}

function selfProfileInput(employee) {
	return {
		firstName: employee.firstName,
		middleName: employee.middleName,
		lastName: employee.lastName,
		nameKana: employee.nameKana,
		birthDate: employee.birthDate.slice(0, 10),
		gender: employee.gender,
		bloodType: employee.bloodType,
		postalCode: employee.postalCode,
		prefecture: employee.prefecture,
		city: employee.city,
		streetAddress: employee.streetAddress,
		buildingName: employee.buildingName,
		mobilePhone: employee.mobilePhone,
		email: employee.email
	};
}

function wholeCalendarMonths(startValue, endValue) {
	const start = new Date(`${startValue.slice(0, 10)}T00:00:00.000Z`);
	const end = new Date(`${endValue.slice(0, 10)}T00:00:00.000Z`);
	let months = (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + end.getUTCMonth() - start.getUTCMonth();
	if (end.getUTCDate() < start.getUTCDate()) months -= 1;
	return Math.max(0, months);
}

try {
	await client.connect();
	const databaseName = await client.query('SELECT current_database() AS name');
	if (databaseName.rows[0]?.name !== verificationDatabaseName) throw new Error('API verification database does not match API_VERIFY_DATABASE_NAME.');
	const accountResult = await client.query(`SELECT e.id, e.employee_code, e.email, e.password_hash, e.must_change_credentials, er.id AS grant_id, er.role_id
		FROM employees e JOIN employee_roles er ON er.employee_id = e.id AND er.scope_type = 'global' AND er.deleted_at IS NULL
		JOIN roles r ON r.id = er.role_id AND r.code = 'system_administrator' AND r.deleted_at IS NULL
		WHERE e.username = $1 AND e.deleted_at IS NULL`, [username]);
	if (accountResult.rowCount !== 1) throw new Error('The verification administrator is unavailable.');
	if (accountResult.rows[0].email !== configuredEmail) throw new Error('The initial administrator email was not sourced from INITIAL_ADMIN_EMAIL.');
	employeeId = accountResult.rows[0].id;
	roleGrantId = accountResult.rows[0].grant_id;
	originalMustChange = accountResult.rows[0].must_change_credentials;
	originalRole = accountResult.rows[0].role_id;
	originalPasswordHash = accountResult.rows[0].password_hash;
	await client.query('UPDATE employees SET must_change_credentials = false WHERE id = $1', [employeeId]);

	const unauthenticated = await request('/v1/departments');
	if (unauthenticated.status !== 401) throw new Error(`Unauthenticated guard verification failed (${unauthenticated.status}).`);
	await payload(unauthenticated);
	const unauthenticatedEmployees = await request('/v1/employees');
	if (unauthenticatedEmployees.status !== 401) throw new Error(`Unauthenticated employee read guard failed (${unauthenticatedEmployees.status}).`);
	await payload(unauthenticatedEmployees);
	const unauthenticatedProfile = await request('/v1/employees/me');
	if (unauthenticatedProfile.status !== 401) throw new Error(`Unauthenticated employee profile guard failed (${unauthenticatedProfile.status}).`);
	await payload(unauthenticatedProfile);
	const unauthenticatedProfileUpdate = await request('/v1/employees/me', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: '{}' });
	if (unauthenticatedProfileUpdate.status !== 401) throw new Error(`Unauthenticated employee profile update guard failed (${unauthenticatedProfileUpdate.status}).`);
	await payload(unauthenticatedProfileUpdate);
	const unauthenticatedSettings = await request('/v1/settings');
	if (unauthenticatedSettings.status !== 401) throw new Error(`Unauthenticated settings guard failed (${unauthenticatedSettings.status}).`);
	await payload(unauthenticatedSettings);
	const unauthenticatedPassword = await request('/v1/auth/password', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: '{}' });
	if (unauthenticatedPassword.status !== 401) throw new Error(`Unauthenticated password guard failed (${unauthenticatedPassword.status}).`);
	await payload(unauthenticatedPassword);
	const unauthenticatedCodePreview = await request('/v1/it-asset-code-previews?typeId=1');
	if (unauthenticatedCodePreview.status !== 401) throw new Error(`Management code preview guard failed (${unauthenticatedCodePreview.status}).`);
	await payload(unauthenticatedCodePreview);
	const unauthenticatedCalendars = await request('/v1/work-calendars');
	if (unauthenticatedCalendars.status !== 401) throw new Error(`Unauthenticated work calendar guard failed (${unauthenticatedCalendars.status}).`);
	await payload(unauthenticatedCalendars);
	const unauthenticatedExternalLinks = await request('/v1/external-links');
	if (unauthenticatedExternalLinks.status !== 401) throw new Error(`Unauthenticated external link guard failed (${unauthenticatedExternalLinks.status}).`);
	await payload(unauthenticatedExternalLinks);

	const login = await request('/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identifier: username, password }) });
	const loginPayload = await payload(login);
	if (login.status !== 200) throw new Error(`Login verification failed (${login.status}/${loginPayload.error?.code ?? 'UNKNOWN'}).`);
	cookie = login.headers.get('set-cookie')?.split(';')[0];
	if (!cookie) throw new Error('Login did not issue a session cookie.');
	const sessionToken = cookie.slice(cookie.indexOf('=') + 1);
	const sessionTimestamp = await client.query(`SELECT
		abs(EXTRACT(EPOCH FROM (created_at - CURRENT_TIMESTAMP))) < 60 AS created_at_is_current,
		abs(EXTRACT(EPOCH FROM (expires_at - created_at)) - 604800) < 2 AS lifetime_is_seven_days
		FROM sessions WHERE token_hash = $1 AND deleted_at IS NULL`, [createHash('sha256').update(sessionToken).digest('base64url')]);
	if (sessionTimestamp.rowCount !== 1 || !sessionTimestamp.rows[0].created_at_is_current || !sessionTimestamp.rows[0].lifetime_is_seven_days) {
		throw new Error('Prisma timestamp timezone verification failed.');
	}
	const defaultSettings = await request('/v1/settings');
	const defaultSettingsPayload = await payload(defaultSettings);
	if (defaultSettings.status !== 200 || defaultSettingsPayload.data.timeZone !== 'Asia/Tokyo' || defaultSettingsPayload.data.displayLanguage !== 'en') throw new Error('Default settings verification failed.');
	const invalidSettings = await request('/v1/settings', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ timeZone: 'Invalid/TimeZone', displayLanguage: 'invalid' }) });
	if (invalidSettings.status !== 400 || (await payload(invalidSettings)).error.code !== 'VALIDATION_ERROR') throw new Error('Settings validation failed.');
	const savedSettings = await request('/v1/settings', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ timeZone: 'UTC', displayLanguage: 'ja' }) });
	const savedSettingsPayload = await payload(savedSettings);
	if (savedSettings.status !== 200 || savedSettingsPayload.data.timeZone !== 'UTC' || savedSettingsPayload.data.displayLanguage !== 'ja') throw new Error('Settings update failed.');
	const defaultSocialLinks = await request('/v1/settings/social-links');
	if (defaultSocialLinks.status !== 200 || !Array.isArray((await payload(defaultSocialLinks)).data)) throw new Error('Social links list failed.');
	const invalidSocialLink = await request('/v1/settings/social-links', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ links: [{ platform: 'website', url: 'javascript:alert(1)' }] }) });
	if (invalidSocialLink.status !== 400 || (await payload(invalidSocialLink)).error.code !== 'VALIDATION_ERROR') throw new Error('Social link URL validation failed.');
	const duplicateSocialLinks = await request('/v1/settings/social-links', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ links: [{ platform: 'github', url: 'https://github.com/example' }, { platform: 'github', url: 'https://github.com/another' }] }) });
	if (duplicateSocialLinks.status !== 400 || (await payload(duplicateSocialLinks)).error.code !== 'VALIDATION_ERROR') throw new Error('Duplicate social link validation failed.');
	const savedSocialLinks = await request('/v1/settings/social-links', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ links: [{ platform: 'website', url: 'https://example.com' }, { platform: 'github', url: 'https://github.com/example' }, { platform: 'qiita', url: 'https://qiita.com/example' }, { platform: 'note', url: 'https://note.com/example' }] }) });
	const savedSocialLinksPayload = await payload(savedSocialLinks);
	if (savedSocialLinks.status !== 200 || savedSocialLinksPayload.data.length !== 4) throw new Error('Social links update failed.');
	const employeeWithSocialLinks = await request(`/v1/employees/${employeeId}`);
	const employeeWithSocialLinksPayload = await payload(employeeWithSocialLinks);
	if (employeeWithSocialLinks.status !== 200 || employeeWithSocialLinksPayload.data.socialLinks.length !== 4 || employeeWithSocialLinksPayload.data.socialLinks.some((link) => Object.keys(link).some((key) => !['platform', 'url'].includes(key)))) throw new Error('Employee social links output failed.');
	const replacedSocialLinks = await request('/v1/settings/social-links', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ links: [{ platform: 'github', url: 'https://github.com/updated' }] }) });
	if (replacedSocialLinks.status !== 200 || (await payload(replacedSocialLinks)).data[0]?.url !== 'https://github.com/updated') throw new Error('Social link replacement failed.');
	const retainedSocialLinks = await client.query(`SELECT platform, deleted_at IS NOT NULL AS deleted FROM employee_social_links WHERE employee_id = $1 ORDER BY platform`, [employeeId]);
	if (retainedSocialLinks.rowCount !== 4 || !retainedSocialLinks.rows.find((link) => link.platform === 'website')?.deleted || retainedSocialLinks.rows.find((link) => link.platform === 'github')?.deleted) throw new Error('Social link soft deletion failed.');
	const clearedSocialLinks = await request('/v1/settings/social-links', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ links: [] }) });
	if (clearedSocialLinks.status !== 200 || (await payload(clearedSocialLinks)).data.length !== 0) throw new Error('Social link cleanup failed.');
	const localizedSession = await request('/v1/auth/session');
	const localizedSessionPayload = await payload(localizedSession);
	if (localizedSessionPayload.data.user.timeZone !== 'UTC' || localizedSessionPayload.data.user.displayLanguage !== 'ja') throw new Error('Session localization failed.');
	const weakPassword = await request('/v1/auth/password', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ currentPassword: password, newPassword: 'too-weak', confirmation: 'too-weak' }) });
	if (weakPassword.status !== 400 || (await payload(weakPassword)).error.code !== 'VALIDATION_ERROR') throw new Error('Password strength validation failed.');
	const wrongCurrentPassword = await request('/v1/auth/password', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ currentPassword: `${password}wrong`, newPassword: 'ValidPassword123', confirmation: 'ValidPassword123' }) });
	if (wrongCurrentPassword.status !== 400 || (await payload(wrongCurrentPassword)).error.code !== 'INVALID_CURRENT_PASSWORD') throw new Error('Current password verification failed.');
	const settingsPassword = `SettingsA${randomUUID().replaceAll('-', '').slice(0, 12)}9`;
	const changedSettingsPassword = await request('/v1/auth/password', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ currentPassword: password, newPassword: settingsPassword, confirmation: settingsPassword }) });
	if (changedSettingsPassword.status !== 200 || !(await payload(changedSettingsPassword)).data.signedOut) throw new Error('Password change failed.');
	if ((await request('/v1/auth/session')).status !== 401) throw new Error('Password change did not invalidate the current session.');
	cookie = undefined;
	const changedSettingsLogin = await request('/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identifier: username, password: settingsPassword }) });
	if (changedSettingsLogin.status !== 200) throw new Error('Changed settings password login failed.');
	cookie = changedSettingsLogin.headers.get('set-cookie')?.split(';')[0];
	if (!cookie) throw new Error('Changed settings password login did not issue a session cookie.');
	const restoredPassword = await request('/v1/auth/password', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ currentPassword: settingsPassword, newPassword: password, confirmation: password }) });
	if (restoredPassword.status !== 200) throw new Error('Password restore failed.');
	cookie = undefined;
	const restoredPasswordLogin = await request('/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identifier: username, password }) });
	if (restoredPasswordLogin.status !== 200) throw new Error('Restored password login failed.');
	cookie = restoredPasswordLogin.headers.get('set-cookie')?.split(';')[0];
	if (!cookie) throw new Error('Restored password login did not issue a session cookie.');
	const settingsRestored = await request('/v1/settings', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ timeZone: 'Asia/Tokyo', displayLanguage: 'en' }) });
	if (settingsRestored.status !== 200) throw new Error('Settings restore failed.');
	for (const resource of ['desks', 'chairs']) {
		const list = await request(`/v1/${resource}`);
		if (list.status !== 404 || (await payload(list)).error.code !== 'NOT_FOUND') throw new Error(`Removed ${resource} list endpoint is still available.`);
		const create = await request(`/v1/${resource}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
		if (create.status !== 404 || (await payload(create)).error.code !== 'NOT_FOUND') throw new Error(`Removed ${resource} create endpoint is still available.`);
		const update = await request(`/v1/${resource}/1`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: '{}' });
		if (update.status !== 404 || (await payload(update)).error.code !== 'NOT_FOUND') throw new Error(`Removed ${resource} update endpoint is still available.`);
		const remove = await request(`/v1/${resource}/1`, { method: 'DELETE' });
		if (remove.status !== 404 || (await payload(remove)).error.code !== 'NOT_FOUND') throw new Error(`Removed ${resource} delete endpoint is still available.`);
	}

	const suffix = randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase();
	const created = await request('/v1/departments', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: `Verification ${suffix}`, sortOrder: 8765 }) });
	if (created.status !== 201) throw new Error(`Create verification failed (${created.status}).`);
	const item = (await payload(created)).data;
	if (item.sortOrder !== 8765) throw new Error('Department create omitted sort order.');
	const updated = await request(`/v1/departments/${item.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: `Verified ${suffix}`, sortOrder: 8764 }) });
	if (updated.status !== 200) throw new Error(`Update verification failed (${updated.status}).`);
	if ((await payload(updated)).data.sortOrder !== 8764) throw new Error('Department update omitted sort order.');
	const invalidSortOrder = await request(`/v1/departments/${item.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: `Verified ${suffix}`, sortOrder: -1 }) });
	if (invalidSortOrder.status !== 400) throw new Error(`Invalid department sort order was accepted (${invalidSortOrder.status}).`);
	const removed = await request(`/v1/departments/${item.id}`, { method: 'DELETE' });
	if (removed.status !== 200) throw new Error(`Delete verification failed (${removed.status}).`);
	await payload(removed);
	const removedAgain = await request(`/v1/departments/${item.id}`, { method: 'DELETE' });
	if (removedAgain.status !== 404) throw new Error(`Repeated delete verification failed (${removedAgain.status}).`);
	const listed = await request('/v1/departments?sortBy=sortOrder&sortOrder=DESC&offset=0&limit=10');
	const listedPayload = await payload(listed);
	if (listed.status !== 200 || listedPayload.data.some((entry) => entry.id === item.id) || listedPayload.meta.limit !== 10 || listedPayload.meta.sort.order !== 'desc') throw new Error('The list API contract verification failed.');
	const invalidLimit = await request('/v1/departments?limit=0');
	if (invalidLimit.status !== 422 || (await payload(invalidLimit)).error.code !== 'INVALID_LIMIT') throw new Error('The list limit guard verification failed.');
	const databaseResult = await client.query('SELECT deleted_at IS NOT NULL AS deleted FROM employment_departments WHERE id = $1', [item.id]);
	if (databaseResult.rowCount !== 1 || !databaseResult.rows[0].deleted) throw new Error('The record was not retained as soft-deleted data.');
	const positionResponse = await request('/v1/positions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: `Position ${suffix}`, sortOrder: 8763 }) });
	if (positionResponse.status !== 201 || (await payload(positionResponse)).data.sortOrder !== 8763) throw new Error(`Position sort order create failed (${positionResponse.status}).`);
	const position = (await payload(await request(`/v1/positions?search=${encodeURIComponent(`Position ${suffix}`)}&sortBy=sortOrder&sortOrder=asc&limit=10`))).data[0];
	if (!position || (await request(`/v1/positions/${position.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: position.name, sortOrder: 8762 }) })).status !== 200) throw new Error('Position sort order update failed.');
	if ((await request(`/v1/positions/${position.id}`, { method: 'DELETE' })).status !== 200) throw new Error('Position cleanup failed.');
	const groupDepartmentResponse = await request('/v1/departments', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: `Group department ${suffix}` }) });
	const otherGroupDepartmentResponse = await request('/v1/departments', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: `Other group department ${suffix}` }) });
	if (groupDepartmentResponse.status !== 201 || otherGroupDepartmentResponse.status !== 201) throw new Error('Group department setup failed.');
	const groupDepartment = (await payload(groupDepartmentResponse)).data;
	const otherGroupDepartment = (await payload(otherGroupDepartmentResponse)).data;
	if (groupDepartment.sortOrder !== 9999 || otherGroupDepartment.sortOrder !== 9999) throw new Error('Department default sort order failed.');
	const groupName = `Group ${suffix}`;
	const employeeGroupResponse = await request('/v1/employee-groups', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: groupName, departmentId: groupDepartment.id, sortOrder: 8761 }) });
	if (employeeGroupResponse.status !== 201) throw new Error(`Employee group create failed (${employeeGroupResponse.status}).`);
	const employeeGroup = (await payload(employeeGroupResponse)).data;
	if (employeeGroup.departmentId !== groupDepartment.id || employeeGroup.department?.id !== groupDepartment.id || employeeGroup.sortOrder !== 8761) throw new Error('Employee group response omitted its department or sort order.');
	const sameNameOtherDepartmentResponse = await request('/v1/employee-groups', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: groupName, departmentId: otherGroupDepartment.id }) });
	if (sameNameOtherDepartmentResponse.status !== 201) throw new Error('The same group name was not accepted in another department.');
	const sameNameOtherDepartment = (await payload(sameNameOtherDepartmentResponse)).data;
	const duplicateGroup = await request('/v1/employee-groups', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: groupName, departmentId: groupDepartment.id }) });
	if (duplicateGroup.status !== 409 || !(await payload(duplicateGroup)).error.details.some((detail) => detail.field === 'name')) throw new Error('Employee group department-scoped uniqueness failed.');
	const groupListResponse = await request(`/v1/employee-groups?search=${encodeURIComponent(groupDepartment.name)}&sortBy=department&sortOrder=asc&limit=10`);
	const groupListPayload = await payload(groupListResponse);
	if (groupListResponse.status !== 200 || !groupListPayload.data.some((entry) => entry.id === employeeGroup.id && entry.department?.id === groupDepartment.id)) throw new Error('Employee group department search or sort failed.');
	const referencedGroupDepartment = await request(`/v1/departments/${groupDepartment.id}`, { method: 'DELETE' });
	if (referencedGroupDepartment.status !== 409 || (await payload(referencedGroupDepartment)).error.code !== 'RESOURCE_IN_USE') throw new Error('Department group reference guard failed.');
	if ((await request(`/v1/employee-groups/${sameNameOtherDepartment.id}`, { method: 'DELETE' })).status !== 200) throw new Error('Employee group duplicate cleanup failed.');

	const employmentTypeResponse = await request('/v1/employment-types', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: `Employee type ${suffix}`, sortOrder: 8760 }) });
	if (employmentTypeResponse.status !== 201) throw new Error(`Employment type verification failed (${employmentTypeResponse.status}).`);
	const employmentType = (await payload(employmentTypeResponse)).data;
	if (employmentType.sortOrder !== 8760) throw new Error('Employment type create omitted sort order.');
	const employeeBranchResponse = await request('/v1/branches', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: `Employee branch ${suffix}`, notes: 'Employee API verification branch' }) });
	if (employeeBranchResponse.status !== 201) throw new Error(`Employee branch verification failed (${employeeBranchResponse.status}).`);
	const employeeBranch = (await payload(employeeBranchResponse)).data;
	const primaryPositionResponse = await request('/v1/positions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: `Primary ${suffix}`, sortOrder: 100 }) });
	const secondaryPositionResponse = await request('/v1/positions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: `Secondary ${suffix}`, sortOrder: 200 }) });
	if (primaryPositionResponse.status !== 201 || secondaryPositionResponse.status !== 201) throw new Error('Employee position setup failed.');
	const primaryPosition = (await payload(primaryPositionResponse)).data;
	const secondaryPosition = (await payload(secondaryPositionResponse)).data;
	const employeeCode = `EMP${suffix}`;
	const employeeInput = { employeeCode, firstName: 'API', lastName: 'Verification', birthDate: '1990-03-15', gender: 'unspecified', email: `${suffix.toLowerCase()}@example.test`, hiredAt: '2020-04-01', departmentIds: [groupDepartment.id, otherGroupDepartment.id], primaryDepartmentId: groupDepartment.id, groupId: employeeGroup.id, positionIds: [primaryPosition.id, secondaryPosition.id], primaryPositionId: primaryPosition.id, employmentTypeId: employmentType.id, branchId: employeeBranch.id, roleCodes: ['general_user'] };
	const mismatchedGroupResponse = await request('/v1/employees', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...employeeInput, employeeCode: `GROUP${suffix}`, email: `${suffix.toLowerCase()}-group@example.test`, primaryDepartmentId: otherGroupDepartment.id }) });
	await expectEmployeeError(mismatchedGroupResponse, 400, 'VALIDATION_ERROR', 'groupId');
	const missingRolesResponse = await request('/v1/employees', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...employeeInput, employeeCode: `NOROLE${suffix}`, roleCodes: [] }) });
	if (missingRolesResponse.status !== 400) throw new Error(`Required employee roles create guard failed (${missingRolesResponse.status}).`);
	await payload(missingRolesResponse);
	const duplicateRolesResponse = await request('/v1/employees', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...employeeInput, employeeCode: `DUPROLE${suffix}`, roleCodes: ['general_user', 'general_user'] }) });
	if (duplicateRolesResponse.status !== 400) throw new Error(`Duplicate employee roles guard failed (${duplicateRolesResponse.status}).`);
	await payload(duplicateRolesResponse);
	const duplicatePositionsResponse = await request('/v1/employees', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...employeeInput, employeeCode: `DUPPOS${suffix}`, email: `${suffix.toLowerCase()}-duppos@example.test`, positionIds: [primaryPosition.id, primaryPosition.id] }) });
	await expectEmployeeError(duplicatePositionsResponse, 400, 'VALIDATION_ERROR', 'positionIds');
	const duplicateDepartmentsResponse = await request('/v1/employees', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...employeeInput, employeeCode: `DUPDEP${suffix}`, email: `${suffix.toLowerCase()}-dupdep@example.test`, departmentIds: [groupDepartment.id, groupDepartment.id] }) });
	await expectEmployeeError(duplicateDepartmentsResponse, 400, 'VALIDATION_ERROR', 'departmentIds');
	const invalidPrimaryDepartmentResponse = await request('/v1/employees', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...employeeInput, employeeCode: `BADDEP${suffix}`, email: `${suffix.toLowerCase()}-baddep@example.test`, primaryDepartmentId: 2147483647 }) });
	await expectEmployeeError(invalidPrimaryDepartmentResponse, 400, 'VALIDATION_ERROR', 'primaryDepartmentId');
	const invalidPrimaryResponse = await request('/v1/employees', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...employeeInput, employeeCode: `BADPRI${suffix}`, email: `${suffix.toLowerCase()}-badpri@example.test`, primaryPositionId: 2147483647 }) });
	await expectEmployeeError(invalidPrimaryResponse, 400, 'VALIDATION_ERROR', 'primaryPositionId');
	const inactivePositionResponse = await request('/v1/employees', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...employeeInput, employeeCode: `BADPOS${suffix}`, email: `${suffix.toLowerCase()}-badpos@example.test`, positionIds: [2147483647], primaryPositionId: 2147483647 }) });
	await expectEmployeeError(inactivePositionResponse, 400, 'VALIDATION_ERROR', 'positionIds');
	for (const field of ['birthDate', 'gender', 'email', 'hiredAt', 'employmentTypeId', 'branchId']) {
		const invalidInput = { ...employeeInput, employeeCode: `BAD${suffix}`, [field]: null };
		const invalidResponse = await request('/v1/employees', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(invalidInput) });
		if (invalidResponse.status !== 400) throw new Error(`Required employee ${field} create guard failed (${invalidResponse.status}).`);
		await payload(invalidResponse);
	}
	const employeeResponse = await request('/v1/employees', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...employeeInput, emergencyContactName: 'Removed', emergencyContactRelation: 'Removed', emergencyContactPhone: '+81 90 0000 0000' }) });
	if (employeeResponse.status !== 201) throw new Error(`Employee create verification failed (${employeeResponse.status}).`);
	const employee = (await payload(employeeResponse)).data;
	if (hasRemovedEmployeeFields(employee) || !hasEmployeeDerivedFields(employee) || employee.email !== employeeInput.email || employee.roles.length !== 1 || employee.roles[0].code !== 'general_user' || employee.departmentIds.length !== 2 || employee.primaryDepartmentId !== groupDepartment.id || employee.departmentId !== groupDepartment.id || employee.departments[0]?.isPrimary !== true || employee.positionIds.length !== 2 || employee.primaryPositionId !== primaryPosition.id || employee.positionId !== primaryPosition.id || employee.positions[0]?.isPrimary !== true) throw new Error('Employee create response contract failed.');
	const employmentUsageLists = {};
	for (const path of ['/v1/departments', '/v1/employee-groups', '/v1/positions', '/v1/employment-types']) {
		const response = await request(`${path}?limit=500`);
		const result = await payload(response);
		if (response.status !== 200 || result.data.some((entry) => !Number.isSafeInteger(entry.usageCount) || entry.usageCount < 0)) throw new Error(`Master usage count contract failed (${path}).`);
		employmentUsageLists[path] = result.data;
	}
	const employmentUsageCount = (path, id) => employmentUsageLists[path].find((entry) => entry.id === id)?.usageCount;
	if (employmentUsageCount('/v1/departments', groupDepartment.id) !== 2 || employmentUsageCount('/v1/employee-groups', employeeGroup.id) !== 1 || employmentUsageCount('/v1/positions', primaryPosition.id) !== 1 || employmentUsageCount('/v1/positions', secondaryPosition.id) !== 1 || employmentUsageCount('/v1/employment-types', employmentType.id) !== 1) throw new Error('Employment master usage counts are incorrect.');
	const positionRows = await client.query('SELECT position_id, is_primary FROM employee_positions WHERE employee_id = $1 AND deleted_at IS NULL ORDER BY is_primary DESC, position_id', [employee.id]);
	if (positionRows.rowCount !== 2 || !positionRows.rows[0].is_primary) throw new Error('Employee positions were not persisted.');
	const departmentRows = await client.query('SELECT department_id, is_primary FROM employee_departments WHERE employee_id = $1 AND deleted_at IS NULL ORDER BY is_primary DESC, department_id', [employee.id]);
	if (departmentRows.rowCount !== 2 || !departmentRows.rows[0].is_primary) throw new Error('Employee departments were not persisted.');
	const referencedPositionDelete = await request(`/v1/positions/${secondaryPosition.id}`, { method: 'DELETE' });
	if (referencedPositionDelete.status !== 409 || (await payload(referencedPositionDelete)).error.code !== 'RESOURCE_IN_USE') throw new Error('Employee position reference guard failed.');
	const positionSearch = await request(`/v1/employees?search=${encodeURIComponent(secondaryPosition.name)}&limit=10`);
	if (positionSearch.status !== 200 || !(await payload(positionSearch)).data.some((entry) => entry.id === employee.id)) throw new Error('Employee secondary position search failed.');
	const primarySwapResponse = await request(`/v1/employees/${employee.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...employeeInput, primaryPositionId: secondaryPosition.id }) });
	const primarySwap = await payload(primarySwapResponse);
	if (primarySwapResponse.status !== 200 || primarySwap.data.primaryPositionId !== secondaryPosition.id || primarySwap.data.positionId !== secondaryPosition.id) throw new Error('Employee primary position update failed.');
	const conflictingGroupMove = await request(`/v1/employee-groups/${employeeGroup.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: groupName, departmentId: otherGroupDepartment.id }) });
	if (conflictingGroupMove.status !== 409 || (await payload(conflictingGroupMove)).error.code !== 'RESOURCE_IN_USE') throw new Error('Employee group department conflict guard failed.');
	if (employee.canIssueInvitation !== true || !employee.invitationUrl?.startsWith('/account-setup#token=')) throw new Error('System administrator employee creation did not issue an invitation.');
	const invitationToken = new URLSearchParams(new URL(employee.invitationUrl, baseUrl).hash.slice(1)).get('token');
	if (!invitationToken || invitationToken.length !== 43) throw new Error('Invitation token format is invalid.');
	const setupPassword = `InviteA${suffix.toLowerCase()}9`;
	const setupRequest = (token, password) => request('/v1/auth/account-setup', { method: 'POST', headers: { 'content-type': 'application/json', 'x-account-invitation': token }, body: JSON.stringify({ password }) });
	if ((await setupRequest(invitationToken, 'weak')).status !== 400) throw new Error('Weak invitation password was accepted.');
	const reissuedResponse = await request(`/v1/employees/${employee.id}/invitations`, { method: 'POST' });
	if (reissuedResponse.status !== 201) throw new Error(`Invitation reissue failed (${reissuedResponse.status}).`);
	const reissued = (await payload(reissuedResponse)).data;
	const newToken = new URLSearchParams(new URL(reissued.invitationUrl, baseUrl).hash.slice(1)).get('token');
	if (!newToken || newToken === invitationToken || (await setupRequest(invitationToken, setupPassword)).status !== 400) throw new Error('Reissued invitation did not invalidate the old link.');
	const expiredSet = await client.query("UPDATE account_invitations SET expires_at = now() - interval '1 minute' WHERE employee_id = $1 AND used_at IS NULL AND deleted_at IS NULL RETURNING expires_at < now() AS expired", [employee.id]);
	if (expiredSet.rowCount !== 1 || !expiredSet.rows[0].expired) throw new Error('Invitation expiration test setup failed.');
	const exactExpiry = await client.query('SELECT expires_at < now() AS expired FROM account_invitations WHERE token_hash = $1', [createHash('sha256').update(newToken).digest('base64url')]);
	if (exactExpiry.rowCount !== 1 || !exactExpiry.rows[0].expired) throw new Error('Reissued invitation does not match the stored token.');
	const expiredAttempt = await setupRequest(newToken, setupPassword);
	if (expiredAttempt.status !== 400) throw new Error(`Expired invitation guard failed (${expiredAttempt.status}/${(await payload(expiredAttempt)).error?.code}).`);
	const replacementResponse = await request(`/v1/employees/${employee.id}/invitations`, { method: 'POST' });
	if (replacementResponse.status !== 201) throw new Error('Invitation could not be reissued after expiration.');
	const replacementToken = new URLSearchParams(new URL((await payload(replacementResponse)).data.invitationUrl, baseUrl).hash.slice(1)).get('token');
	if (!replacementToken) throw new Error('Replacement invitation is missing a token.');
	const replacementState = await client.query('SELECT expires_at > now() AS active, used_at IS NULL AS unused, deleted_at IS NULL AS available FROM account_invitations WHERE token_hash = $1', [createHash('sha256').update(replacementToken).digest('base64url')]);
	if (replacementState.rowCount !== 1 || !replacementState.rows[0].active || !replacementState.rows[0].unused || !replacementState.rows[0].available) throw new Error(`Replacement invitation was not active in the database (${JSON.stringify(replacementState.rows[0] ?? {})}).`);
	const changedEmailResponse = await request(`/v1/employees/${employee.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...employeeInput, email: `${suffix.toLowerCase()}-changed@example.test` }) });
	if (changedEmailResponse.status !== 200 || (await setupRequest(replacementToken, setupPassword)).status !== 400) throw new Error('Changing an employee email did not invalidate the invitation.');
	const restoredEmailResponse = await request(`/v1/employees/${employee.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(employeeInput) });
	if (restoredEmailResponse.status !== 200) throw new Error('Employee email could not be restored after invitation check.');
	const finalInvitationResponse = await request(`/v1/employees/${employee.id}/invitations`, { method: 'POST' });
	if (finalInvitationResponse.status !== 201) throw new Error('Invitation could not be reissued after an email change.');
	const finalToken = new URLSearchParams(new URL((await payload(finalInvitationResponse)).data.invitationUrl, baseUrl).hash.slice(1)).get('token');
	if (!finalToken) throw new Error('Final invitation is missing a token.');
	const fifthInvitationResponse = await request(`/v1/employees/${employee.id}/invitations`, { method: 'POST' });
	if (fifthInvitationResponse.status !== 201) throw new Error('Fifth invitation within the daily limit failed.');
	const acceptedToken = new URLSearchParams(new URL((await payload(fifthInvitationResponse)).data.invitationUrl, baseUrl).hash.slice(1)).get('token');
	if (!acceptedToken || (await setupRequest(finalToken, setupPassword)).status !== 400) throw new Error('New invitation did not replace the previous link.');
	const limitedResponse = await request(`/v1/employees/${employee.id}/invitations`, { method: 'POST' });
	if (limitedResponse.status !== 429 || (await payload(limitedResponse)).error.code !== 'INVITATION_RATE_LIMITED') throw new Error('Invitation daily rate limit failed.');
	const setupResponse = await setupRequest(acceptedToken, setupPassword);
	if (setupResponse.status !== 200) throw new Error(`Invitation account setup failed (${setupResponse.status}/${(await payload(setupResponse)).error?.code}).`);
	if (!(await payload(setupResponse)).data.accountActivated) throw new Error('Invitation account setup did not activate the account.');
	if ((await setupRequest(acceptedToken, setupPassword)).status !== 400) throw new Error('Invitation link was reusable.');
	const adminCookie = cookie;
	cookie = undefined;
	const invitedLogin = await request('/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identifier: employeeInput.email, password: setupPassword }) });
	if (invitedLogin.status !== 200) throw new Error(`Invited employee login failed (${invitedLogin.status}).`);
	cookie = invitedLogin.headers.get('set-cookie')?.split(';')[0];
	const invitedSession = await request('/v1/auth/session');
	if (invitedSession.status !== 200 || (await payload(invitedSession)).data.user.email !== employeeInput.email) throw new Error('Invited employee session validation failed.');
	cookie = adminCookie;
	const duplicateEmailCreate = await request('/v1/employees', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...employeeInput, employeeCode: `MAIL${suffix}` }) });
	await expectEmployeeError(duplicateEmailCreate, 409, 'EMPLOYEE_FIELD_CONFLICT', 'email');
	const duplicateCodeCreate = await request('/v1/employees', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...employeeInput, email: `${suffix.toLowerCase()}-code@example.test` }) });
	await expectEmployeeError(duplicateCodeCreate, 409, 'EMPLOYEE_FIELD_CONFLICT', 'employeeCode');
	const duplicateEmailUpdate = await request(`/v1/employees/${employee.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...employeeInput, email: configuredEmail }) });
	await expectEmployeeError(duplicateEmailUpdate, 409, 'EMPLOYEE_FIELD_CONFLICT', 'email');
	const duplicateCodeUpdate = await request(`/v1/employees/${employee.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...employeeInput, employeeCode: accountResult.rows[0].employee_code }) });
	await expectEmployeeError(duplicateCodeUpdate, 409, 'EMPLOYEE_FIELD_CONFLICT', 'employeeCode');
	const invalidEmployeeCases = [
		['employeeCode', `E${suffix.slice(0, 8)}`],
		['employeeCode', `E${suffix.slice(0, 8)}-`],
		['postalCode', 'invalid'],
		['mobilePhone', 'invalid'],
		['retiredAt', '2019-12-31'],
		['middleName', 'x'.repeat(129)],
		['departmentId', 2147483647]
	];
	for (const [field, value] of invalidEmployeeCases) {
		const invalidResponse = await request(`/v1/employees/${employee.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...employeeInput, [field]: value }) });
		await expectEmployeeError(invalidResponse, 400, 'VALIDATION_ERROR', field);
	}
	const tenCharacterCode = `E${suffix.slice(0, 9)}`;
	const tenCharacterCodeResponse = await request(`/v1/employees/${employee.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...employeeInput, employeeCode: tenCharacterCode }) });
	if (tenCharacterCodeResponse.status !== 200 || (await payload(tenCharacterCodeResponse)).data.employeeCode !== tenCharacterCode) throw new Error('Ten-character employee code was rejected.');
	const restoredCodeResponse = await request(`/v1/employees/${employee.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(employeeInput) });
	if (restoredCodeResponse.status !== 200) throw new Error('Employee code could not be restored after minimum-length verification.');
	const retiredEmployeeResponse = await request(`/v1/employees/${employee.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...employeeInput, retiredAt: '2022-07-15' }) });
	if (retiredEmployeeResponse.status !== 200) throw new Error(`Retired employee duration verification failed (${retiredEmployeeResponse.status}).`);
	const retiredEmployee = (await payload(retiredEmployeeResponse)).data;
	if (retiredEmployee.lengthOfService.years !== 2 || retiredEmployee.lengthOfService.months !== 3) throw new Error('Retired employee duration did not stop at the retirement date.');
	const removedEmailInput = await request('/v1/employees', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...employeeInput, employeeCode: `OLDMAIL${suffix}`, personalEmail: 'removed@example.test' }) });
	if (removedEmailInput.status !== 400) throw new Error('Removed personal email input verification failed.');
	await payload(removedEmailInput);
	for (const field of ['birthDate', 'gender', 'email', 'hiredAt', 'employmentTypeId', 'branchId']) {
		const invalidInput = { ...employeeInput, [field]: null };
		const invalidResponse = await request(`/v1/employees/${employee.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(invalidInput) });
		if (invalidResponse.status !== 400) throw new Error(`Required employee ${field} update guard failed (${invalidResponse.status}).`);
		await payload(invalidResponse);
	}
	const employeeUpdateResponse = await request(`/v1/employees/${employee.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...employeeInput, firstName: 'API Updated', emergencyContactName: 'Removed', emergencyContactRelation: 'Removed', emergencyContactPhone: '+81 90 0000 0000' }) });
	if (employeeUpdateResponse.status !== 200) throw new Error(`Employee update verification failed (${employeeUpdateResponse.status}).`);
	const updatedEmployee = (await payload(employeeUpdateResponse)).data;
	if (hasRemovedEmployeeFields(updatedEmployee) || !hasEmployeeDerivedFields(updatedEmployee) || updatedEmployee.roles[0]?.code !== 'general_user') throw new Error('Employee update response contract failed.');
	const roleListResponse = await request('/v1/roles?sortBy=code&sortOrder=asc&offset=0&limit=100');
	const roleListPayload = await payload(roleListResponse);
	if (roleListResponse.status !== 200 || roleListPayload.data.length !== 3 || roleListPayload.meta.limit !== 100) throw new Error('Role list verification failed.');
	const roleIds = await client.query("SELECT code, id FROM roles WHERE code IN ('system_administrator', 'business_administrator', 'general_user') AND deleted_at IS NULL");
	const roleByCode = Object.fromEntries(roleIds.rows.map((row) => [row.code, row.id]));
	if (!roleByCode.system_administrator || !roleByCode.general_user || !roleByCode.business_administrator) throw new Error('Verification roles are unavailable.');
	await client.query('UPDATE employee_roles SET role_id = $1 WHERE id = $2', [roleByCode.business_administrator, roleGrantId]);
	const forbiddenInvitation = await request(`/v1/employees/${employee.id}/invitations`, { method: 'POST' });
	if (forbiddenInvitation.status !== 403 || (await payload(forbiddenInvitation)).error.code !== 'SYSTEM_ADMIN_REQUIRED') throw new Error('Business administrator invitation guard failed.');
	const businessRoleUpdate = await request(`/v1/employees/${employee.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...employeeInput, firstName: 'API Updated', roleCodes: ['business_administrator'] }) });
	if (businessRoleUpdate.status !== 200 || (await payload(businessRoleUpdate)).data.roles[0]?.code !== 'business_administrator') throw new Error('Business administrator role promotion failed.');
	const forbiddenSystemRole = await request(`/v1/employees/${employee.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...employeeInput, firstName: 'API Updated', roleCodes: ['system_administrator'] }) });
	if (forbiddenSystemRole.status !== 403 || (await payload(forbiddenSystemRole)).error.code !== 'ROLE_ASSIGNMENT_FORBIDDEN') throw new Error('Business administrator system role guard failed.');
	await client.query('UPDATE employee_roles SET role_id = $1 WHERE id = $2', [originalRole, roleGrantId]);
	const systemRoleUpdate = await request(`/v1/employees/${employee.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...employeeInput, firstName: 'API Updated', roleCodes: ['system_administrator', 'general_user'] }) });
	if (systemRoleUpdate.status !== 200 || (await payload(systemRoleUpdate)).data.roles.length !== 2) throw new Error('System administrator role assignment failed.');
	const restoreEmployeeRole = await request(`/v1/employees/${employee.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...employeeInput, firstName: 'API Updated' }) });
	if (restoreEmployeeRole.status !== 200 || (await payload(restoreEmployeeRole)).data.roles[0]?.code !== 'general_user') throw new Error('Employee role restoration failed.');
	const removedEmployeeUpdateInput = await request(`/v1/employees/${employee.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...employeeInput, firstName: 'API Updated', active: false }) });
	if (removedEmployeeUpdateInput.status !== 400) throw new Error('Removed employee update input verification failed.');
	await payload(removedEmployeeUpdateInput);
	const employeeListResponse = await request('/v1/employees?sortBy=employeeCode&sortOrder=asc&offset=0&limit=500');
	if (employeeListResponse.status !== 200) throw new Error(`Employee list verification failed (${employeeListResponse.status}).`);
	const employeeListPayload = await payload(employeeListResponse);
	const listedEmployee = employeeListPayload.data.find((entry) => entry.id === employee.id);
	if (!listedEmployee || hasRemovedEmployeeFields(listedEmployee) || !hasEmployeeDerivedFields(listedEmployee) || listedEmployee.roles[0]?.code !== 'general_user') throw new Error('Employee list contract verification failed.');
	if (!/^\d{4}-\d{2}-\d{2}$/.test(employeeListPayload.meta.calculatedAsOf)) throw new Error('Employee calculation date metadata is unavailable.');
	const expectedAge = Math.floor(wholeCalendarMonths(employeeInput.birthDate, employeeListPayload.meta.calculatedAsOf) / 12);
	const expectedServiceMonths = wholeCalendarMonths(employeeInput.hiredAt, employeeListPayload.meta.calculatedAsOf);
	if (listedEmployee.age !== expectedAge || listedEmployee.lengthOfService.years !== Math.floor(expectedServiceMonths / 12) || listedEmployee.lengthOfService.months !== expectedServiceMonths % 12) throw new Error('Employee derived values are inconsistent with the API calculation date.');
	const employeeSearchResponse = await request('/v1/employees?search=API%20Updated&sortBy=employee&sortOrder=desc&offset=0&limit=10&includeColumns=true');
	if (employeeSearchResponse.status !== 200) throw new Error(`Employee search verification failed (${employeeSearchResponse.status}).`);
	const employeeSearchPayload = await payload(employeeSearchResponse);
	if (!employeeSearchPayload.data.some((entry) => entry.id === employee.id) || employeeSearchPayload.meta.search !== 'API Updated' || employeeSearchPayload.meta.sort.field !== 'employee') throw new Error('Employee search and sort contract verification failed.');
	const employeeColumns = employeeSearchPayload.meta.columns;
	if (!Array.isArray(employeeColumns) || !employeeColumns.some((column) => column.key === 'employeeCode' && column.columnName === 'employee_code') || !employeeColumns.some((column) => column.key === 'email' && column.columnName === 'email') || employeeColumns.some((column) => column.key.startsWith('emergencyContact') || ['active', 'workEmail', 'loginEmail', 'personalEmail'].includes(column.key) || ['active', 'work_email', 'login_email', 'personal_email'].includes(column.columnName))) throw new Error('Employee export column metadata verification failed.');
	const displayedEmployeeSorts = ['employee', 'age', 'lengthOfService', 'department', 'group', 'position', 'employmentType', 'branch', 'roles'];
	const compareText = (left, right) => left === right ? 0 : left < right ? -1 : 1;
	const sortValue = (entry, field) => {
		if (field === 'employee') return `${entry.lastName}\u0000${entry.firstName}`;
		if (field === 'age') return entry.age;
		if (field === 'lengthOfService') return entry.lengthOfService.years * 12 + entry.lengthOfService.months;
		if (field === 'department') return entry.departmentNames ?? '';
		if (field === 'group') return entry.group?.name ?? '';
		if (field === 'position') return entry.positionNames ?? '';
		if (field === 'employmentType') return entry.employmentType?.name ?? '';
		if (field === 'branch') return entry.branch?.name ?? '';
		return entry.roles.map((role) => role.name).join('|');
	};
	for (const sortBy of displayedEmployeeSorts) {
		for (const sortOrder of ['asc', 'desc']) {
			const response = await request(`/v1/employees?sortBy=${sortBy}&sortOrder=${sortOrder}&offset=0&limit=500`);
			if (response.status !== 200) throw new Error(`Employee ${sortBy} ${sortOrder} sort failed (${response.status}).`);
			const result = await payload(response);
			if (result.meta.sort.field !== sortBy || result.meta.sort.order !== sortOrder) throw new Error(`Employee ${sortBy} ${sortOrder} sort metadata failed.`);
			const values = result.data.map((entry) => sortValue(entry, sortBy)).filter((value) => value !== null && value !== undefined && value !== '');
			if (values.some((value, index) => index > 0 && (sortOrder === 'asc' ? compareText(values[index - 1], value) > 0 : compareText(values[index - 1], value) < 0))) throw new Error(`Employee ${sortBy} ${sortOrder} order failed.`);
		}
	}
	const removedEmployeeSort = await request('/v1/employees?sortBy=active');
	if (removedEmployeeSort.status !== 422) throw new Error('Removed employee sort verification failed.');
	await payload(removedEmployeeSort);
	const removedEmployeeInput = await request('/v1/employees', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...employeeInput, employeeCode: `OLD${suffix}`, active: false }) });
	if (removedEmployeeInput.status !== 400) throw new Error('Removed employee input verification failed.');
	await payload(removedEmployeeInput);
	const employeePageResponse = await request('/v1/employees?sortBy=employee&sortOrder=asc&offset=10&limit=10');
	const employeePagePayload = await payload(employeePageResponse);
	if (employeePageResponse.status !== 200 || employeePagePayload.meta.offset !== 10 || employeePagePayload.meta.limit !== 10 || employeePagePayload.data.length > 10) throw new Error('Employee pagination verification failed.');
	const invalidEmployeeSearch = await request(`/v1/employees?search=${'x'.repeat(201)}`);
	if (invalidEmployeeSearch.status !== 422 || (await payload(invalidEmployeeSearch)).error.code !== 'INVALID_SEARCH') throw new Error('Employee search length guard verification failed.');
	const invalidColumnMetadata = await request('/v1/employees?includeColumns=yes');
	if (invalidColumnMetadata.status !== 422 || (await payload(invalidColumnMetadata)).error.code !== 'INVALID_INCLUDE_COLUMNS') throw new Error('Employee column metadata guard verification failed.');
	const branchContactInput = { name: employeeBranch.name, openedOn: '2020-04-01', closedOn: null, phoneNumber1: '0000-00-0000', phoneNumber1Label: `Main ${suffix}`, phoneNumber2: '0000-00-1111', phoneNumber2Label: 'Development', faxNumber1: '0000-00-2222', faxNumber1Label: 'Main', faxNumber2: '0000-00-3333', faxNumber2Label: 'Development', managerEmployeeId: employee.id, deputyManagerEmployeeId: employeeId, notes: 'Employee API verification branch' };
	const branchContactUpdate = await request(`/v1/branches/${employeeBranch.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(branchContactInput) });
	const updatedBranch = (await payload(branchContactUpdate)).data;
	if (branchContactUpdate.status !== 200 || updatedBranch.openedOn?.slice(0, 10) !== branchContactInput.openedOn || updatedBranch.phoneNumber2 !== branchContactInput.phoneNumber2 || updatedBranch.faxNumber2Label !== branchContactInput.faxNumber2Label || updatedBranch.manager?.id !== employee.id || updatedBranch.deputyManager?.id !== employeeId) throw new Error('Branch dates, contact, and responsibility update failed.');
	for (const invalidDates of [
		{ openedOn: '2020-02-30', closedOn: null },
		{ openedOn: '2020-04-01', closedOn: '2020-03-31' }
	]) {
		const invalidBranchDate = await request(`/v1/branches/${employeeBranch.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...branchContactInput, ...invalidDates }) });
		if (invalidBranchDate.status !== 400 || (await payload(invalidBranchDate)).error.code !== 'INVALID_REQUEST') throw new Error('Branch date validation failed.');
	}
	const referencedBranchClose = await request(`/v1/branches/${employeeBranch.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...branchContactInput, closedOn: '2026-09-25' }) });
	if (referencedBranchClose.status !== 409 || (await payload(referencedBranchClose)).error.code !== 'RESOURCE_IN_USE') throw new Error('Referenced branch closing guard failed.');
	const unchangedReferencedBranch = await client.query('SELECT closed_on IS NULL AND deleted_at IS NULL AS unchanged FROM branches WHERE id = $1', [employeeBranch.id]);
	if (!unchangedReferencedBranch.rows[0]?.unchanged) throw new Error('Referenced branch closing was not rolled back.');
	const branchSearch = await request(`/v1/branches?search=${encodeURIComponent(branchContactInput.phoneNumber1Label)}`);
	if (branchSearch.status !== 200 || !(await payload(branchSearch)).data.some((entry) => entry.id === employeeBranch.id)) throw new Error('Branch contact search failed.');
	const invalidBranchManager = await request(`/v1/branches/${employeeBranch.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...branchContactInput, managerEmployeeId: 2147483647 }) });
	if (invalidBranchManager.status !== 400 || (await payload(invalidBranchManager)).error.details[0]?.field !== 'managerEmployeeId') throw new Error('Branch manager reference guard failed.');
	for (const input of [
		{ ...branchContactInput, managerEmployeeId: null },
		{ ...branchContactInput, deputyManagerEmployeeId: employee.id },
		{ ...branchContactInput, phoneNumber1: null },
		{ ...branchContactInput, faxNumber1: null }
	]) {
		const invalidBranch = await request(`/v1/branches/${employeeBranch.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) });
		if (invalidBranch.status !== 400 || (await payload(invalidBranch)).error.code !== 'INVALID_REQUEST') throw new Error('Branch responsibility or contact order guard failed.');
	}
	const responsibleEmployeeDelete = await request(`/v1/employees/${employee.id}`, { method: 'DELETE' });
	if (responsibleEmployeeDelete.status !== 409 || (await payload(responsibleEmployeeDelete)).error.code !== 'RESOURCE_IN_USE') throw new Error('Branch responsible employee delete guard failed.');
	const clearedBranchManager = await request(`/v1/branches/${employeeBranch.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...branchContactInput, managerEmployeeId: null, deputyManagerEmployeeId: null }) });
	if (clearedBranchManager.status !== 200) throw new Error('Branch manager could not be cleared.');
	const removedEmployee = await request(`/v1/employees/${employee.id}`, { method: 'DELETE' });
	if (removedEmployee.status !== 200) throw new Error(`Employee soft-delete verification failed (${removedEmployee.status}).`);
	for (const employeePosition of [primaryPosition, secondaryPosition]) {
		if ((await request(`/v1/positions/${employeePosition.id}`, { method: 'DELETE' })).status !== 200) throw new Error('Employee position cleanup failed.');
	}
	const movedGroupResponse = await request(`/v1/employee-groups/${employeeGroup.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: `Moved ${suffix}`, departmentId: otherGroupDepartment.id }) });
	if (movedGroupResponse.status !== 200 || (await payload(movedGroupResponse)).data.department?.id !== otherGroupDepartment.id) throw new Error('Unreferenced employee group department update failed.');
	if ((await request(`/v1/employee-groups/${employeeGroup.id}`, { method: 'DELETE' })).status !== 200) throw new Error('Employee group cleanup failed.');
	if ((await request(`/v1/departments/${groupDepartment.id}`, { method: 'DELETE' })).status !== 200 || (await request(`/v1/departments/${otherGroupDepartment.id}`, { method: 'DELETE' })).status !== 200) throw new Error('Employee group department cleanup failed.');
	const removedEmploymentType = await request(`/v1/employment-types/${employmentType.id}`, { method: 'DELETE' });
	if (removedEmploymentType.status !== 200) throw new Error(`Employment type soft-delete verification failed (${removedEmploymentType.status}).`);
	const closedEmployeeBranch = await request(`/v1/branches/${employeeBranch.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...branchContactInput, managerEmployeeId: null, deputyManagerEmployeeId: null, closedOn: '2026-09-25' }) });
	const closedEmployeeBranchData = (await payload(closedEmployeeBranch)).data;
	if (closedEmployeeBranch.status !== 200 || closedEmployeeBranchData.closedOn?.slice(0, 10) !== '2026-09-25') throw new Error(`Employee branch closing verification failed (${closedEmployeeBranch.status}).`);
	const closedEmployeeBranchState = await client.query('SELECT closed_on::text AS closed_on, deleted_at = updated_at AS timestamps_match FROM branches WHERE id = $1', [employeeBranch.id]);
	if (closedEmployeeBranchState.rows[0]?.closed_on !== '2026-09-25' || !closedEmployeeBranchState.rows[0]?.timestamps_match) throw new Error('Branch closing dates were not stored consistently.');
	const closedBranchList = await request(`/v1/branches?search=${encodeURIComponent(employeeBranch.name)}`);
	if (closedBranchList.status !== 200 || (await payload(closedBranchList)).data.some((entry) => entry.id === employeeBranch.id)) throw new Error('Closed branch remained in the active list.');
	const closedBranchUpdate = await request(`/v1/branches/${employeeBranch.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...branchContactInput, managerEmployeeId: null, deputyManagerEmployeeId: null }) });
	if (closedBranchUpdate.status !== 404) throw new Error('Closed branch remained editable.');
	await payload(closedBranchUpdate);
	const historicalBranchResponse = await request('/v1/branches', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: `Historical branch ${suffix}`, openedOn: '2000-01-01', closedOn: '2010-12-31' }) });
	const historicalBranch = (await payload(historicalBranchResponse)).data;
	if (historicalBranchResponse.status !== 201 || historicalBranch.closedOn?.slice(0, 10) !== '2010-12-31') throw new Error('Historical closed branch creation failed.');
	const historicalBranchState = await client.query('SELECT deleted_at IS NOT NULL AS deleted, deleted_at = updated_at AS timestamps_match FROM branches WHERE id = $1', [historicalBranch.id]);
	if (!historicalBranchState.rows[0]?.deleted || !historicalBranchState.rows[0]?.timestamps_match) throw new Error('Historical branch was not created as soft-deleted.');
	const historicalBranchList = await request(`/v1/branches?search=${encodeURIComponent(historicalBranch.name)}&sortBy=openedOn&sortOrder=asc`);
	if (historicalBranchList.status !== 200 || (await payload(historicalBranchList)).data.some((entry) => entry.id === historicalBranch.id)) throw new Error('Historical closed branch remained in the active list.');

	const branchResponse = await request('/v1/branches', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: `Branch ${suffix}`, notes: 'Asset API verification branch' }) });
	if (branchResponse.status !== 201) throw new Error(`Branch verification failed (${branchResponse.status}).`);
	const branch = (await payload(branchResponse)).data;
	if (branch.sortOrder !== 9999) throw new Error('Branch default sort order failed.');
	const branchSortUpdate = await request(`/v1/branches/${branch.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: branch.name, sortOrder: 8759, notes: 'Asset API verification branch' }) });
	if (branchSortUpdate.status !== 200 || (await payload(branchSortUpdate)).data.sortOrder !== 8759) throw new Error('Branch sort order update failed.');
	const roomResponse = await request('/v1/rooms', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: `Room ${suffix}`, branchId: branch.id, sortOrder: 8758, notes: 'Asset API verification room' }) });
	if (roomResponse.status !== 201) throw new Error(`Room verification failed (${roomResponse.status}).`);
	const room = (await payload(roomResponse)).data;
	if (room.sortOrder !== 8758) throw new Error('Room sort order create failed.');
	const roomSortUpdate = await request(`/v1/rooms/${room.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: room.name, branchId: branch.id, sortOrder: 8757, notes: room.notes }) });
	if (roomSortUpdate.status !== 200) throw new Error('Room sort order update failed.');
	const storageResponse = await request('/v1/storage', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: `Storage ${suffix}`, branchId: branch.id, roomId: room.id, notes: 'Asset API verification storage' }) });
	if (storageResponse.status !== 201) throw new Error(`Storage verification failed (${storageResponse.status}).`);
	const storage = (await payload(storageResponse)).data;
	if (storage.sortOrder !== 9999) throw new Error('Storage default sort order failed.');
	const storageSortUpdate = await request(`/v1/storage/${storage.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: storage.name, branchId: branch.id, roomId: room.id, sortOrder: 8756, notes: storage.notes }) });
	if (storageSortUpdate.status !== 200) throw new Error('Storage sort order update failed.');
	for (const path of ['/v1/branches?sortBy=sortOrder&sortOrder=asc', '/v1/rooms?sortBy=sortOrder&sortOrder=asc', '/v1/storage?sortBy=sortOrder&sortOrder=asc']) if ((await request(path)).status !== 200) throw new Error(`Location sort failed (${path}).`);
	const oldStorageEndpoint = await request('/v1/storage-locations');
	if (oldStorageEndpoint.status !== 404) throw new Error('Removed storage-locations endpoint is still available.');
	const [typesResponse, statusesResponse] = await Promise.all([request('/v1/it-asset-types?limit=500'), request('/v1/it-asset-statuses?limit=500')]);
	const types = (await payload(typesResponse)).data;
	const statuses = (await payload(statusesResponse)).data;
	const type = types.find((entry) => entry.name === 'Laptop') ?? types[0];
	const displayType = types.find((entry) => entry.name === 'Display');
	const status = statuses.find((entry) => entry.name === 'Normal') ?? statuses[0];
	if (!type || !status || !displayType || displayType.managementCodePrefix !== 'DSP') throw new Error('IT asset reference masters are unavailable.');
	const verificationPrefix = 'T' + [...suffix.slice(0, 4)].map(value => String.fromCharCode(65 + parseInt(value, 16))).join('');
	const invalidType = await request('/v1/it-asset-types', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: `Invalid prefix ${suffix}`, managementCodePrefix: 'AB' }) });
	if (invalidType.status !== 400) throw new Error('IT asset type prefix validation failed.');
	const codeTypeResponse = await request('/v1/it-asset-types', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: `Code verification ${suffix}`, managementCodePrefix: verificationPrefix }) });
	if (codeTypeResponse.status !== 201) throw new Error(`IT asset type creation failed (${codeTypeResponse.status}).`);
	const codeType = (await payload(codeTypeResponse)).data;
	if (codeType.sortOrder !== 9999) throw new Error('IT asset type default sort order failed.');
	await client.query('UPDATE it_asset_types SET next_management_number = 10000 WHERE id = $1', [codeType.id]);
	await expectItAssetError(await request(`/v1/it-asset-code-previews?typeId=${codeType.id}`), 409, 'IT_ASSET_CODE_EXHAUSTED', 'assetTag');
	await expectItAssetError(await request('/v1/it-assets', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ typeId: codeType.id, statusId: status.id, storageId: storage.id, purchasedOn: '2026-09-01' }) }), 409, 'IT_ASSET_CODE_EXHAUSTED', 'assetTag');
	const removedCodeType = await request(`/v1/it-asset-types/${codeType.id}`, { method: 'DELETE' });
	if (removedCodeType.status !== 200) throw new Error(`IT asset type cleanup failed (${removedCodeType.status}).`);
	const manufacturerResponse = await request('/v1/manufacturers', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: `Manufacturer ${suffix}` }) });
	if (manufacturerResponse.status !== 201) throw new Error(`Manufacturer verification failed (${manufacturerResponse.status}).`);
	const manufacturer = (await payload(manufacturerResponse)).data;
	if (Object.hasOwn(manufacturer, 'code') || manufacturer.sortOrder !== 9999) throw new Error('Manufacturer response contract or default sort order failed.');
	const cpuTypeInput = { manufacturerId: manufacturer.id, series: 'Verification', modelNumber: `CPU-${suffix}`, name: `CPU verification ${suffix}`, sortOrder: 900 };
	const cpuTypeResponse = await request('/v1/cpu-types', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cpuTypeInput) });
	if (cpuTypeResponse.status !== 201) throw new Error(`CPU type verification failed (${cpuTypeResponse.status}).`);
	const cpuType = (await payload(cpuTypeResponse)).data;
	if (Object.hasOwn(cpuType, 'code')) throw new Error('CPU type response still exposes the removed code field.');
	const duplicateCpuType = await request('/v1/cpu-types', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...cpuTypeInput, modelNumber: `CPU-DUP-${suffix}` }) });
	const duplicateCpuPayload = await payload(duplicateCpuType);
	if (duplicateCpuType.status !== 409 || duplicateCpuPayload.error?.details?.[0]?.field !== 'name') throw new Error(`CPU type name natural key verification failed (${duplicateCpuType.status}/${duplicateCpuPayload.error?.details?.[0]?.field ?? 'none'}).`);
	const operatingSystemInput = { vendor: 'Verification vendor', product: 'Verification OS', version: suffix, displayName: `Operating system verification ${suffix}`, sortOrder: 900 };
	const operatingSystemResponse = await request('/v1/operating-systems', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(operatingSystemInput) });
	if (operatingSystemResponse.status !== 201) throw new Error(`Operating system verification failed (${operatingSystemResponse.status}).`);
	const operatingSystem = (await payload(operatingSystemResponse)).data;
	if (Object.hasOwn(operatingSystem, 'code')) throw new Error('Operating system response still exposes the removed code field.');
	const duplicateOperatingSystem = await request('/v1/operating-systems', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...operatingSystemInput, version: `${suffix}-duplicate` }) });
	const duplicateOperatingSystemPayload = await payload(duplicateOperatingSystem);
	if (duplicateOperatingSystem.status !== 409 || duplicateOperatingSystemPayload.error?.details?.[0]?.field !== 'displayName') throw new Error(`Operating system display-name natural key verification failed (${duplicateOperatingSystem.status}/${duplicateOperatingSystemPayload.error?.details?.[0]?.field ?? 'none'}).`);
	for (const [path, expectedSort] of [['/v1/manufacturers?q=Manufacturer&sortBy=name', 'name'], ['/v1/cpu-types?q=CPU%20verification&sortBy=name', 'name'], ['/v1/operating-systems?q=Operating%20system%20verification&sortBy=displayName', 'displayName']]) {
		const response = await request(path);
		const result = await payload(response);
		if (response.status !== 200 || result.meta.sort.field !== expectedSort || !result.data.length) throw new Error(`Code-free master list verification failed (${path}).`);
	}
	const assetInput = { typeId: type.id, statusId: status.id, storageId: storage.id, purchasedOn: '2026-09-01', manufacturerId: manufacturer.id, serialNumber: `SER_${suffix}` };
	await expectItAssetError(await request('/v1/it-assets', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...assetInput, purchasedOn: '' }) }), 400, 'VALIDATION_ERROR', 'purchasedOn');
	await expectItAssetError(await request('/v1/it-assets', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...assetInput, typeId: '' }) }), 400, 'VALIDATION_ERROR', 'typeId');
	await expectItAssetError(await request('/v1/it-assets', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...assetInput, storageId: 0 }) }), 400, 'VALIDATION_ERROR', 'storageId');
	await expectItAssetError(await request('/v1/it-assets', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...assetInput, storageId: 2147483647 }) }), 400, 'VALIDATION_ERROR', 'storageId');
	await expectItAssetError(await request('/v1/it-assets', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...assetInput, purchasedOn: '2026-02-30' }) }), 400, 'VALIDATION_ERROR', 'purchasedOn');
	await expectItAssetError(await request('/v1/it-assets', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...assetInput, purchasedOn: '2026-03-02', disposalOn: '2026-03-01' }) }), 400, 'VALIDATION_ERROR', 'disposalOn');
	await expectItAssetError(await request('/v1/it-assets', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...assetInput, ramGb: 0 }) }), 400, 'VALIDATION_ERROR', 'ramGb');
	const requiredDisposalStatus = statuses.find((entry) => entry.disposalDatePolicy === 'required');
	if (requiredDisposalStatus) await expectItAssetError(await request('/v1/it-assets', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...assetInput, statusId: requiredDisposalStatus.id }) }), 400, 'VALIDATION_ERROR', 'disposalOn');
	const noCpuType = types.find((entry) => !entry.supportsCpu);
	if (noCpuType) await expectItAssetError(await request('/v1/it-assets', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...assetInput, typeId: noCpuType.id, cpuTypeId: 2147483647 }) }), 400, 'VALIDATION_ERROR', 'cpuTypeId');
	const previewResponse = await request(`/v1/it-asset-code-previews?typeId=${type.id}`);
	if (previewResponse.status !== 200) throw new Error(`IT asset code preview failed (${previewResponse.status}).`);
	const preview = (await payload(previewResponse)).data.assetTag;
	if (!new RegExp(`^${type.managementCodePrefix}-[0-9]{3}$`).test(preview)) throw new Error('IT asset code preview format failed.');
	await expectItAssetError(await request('/v1/it-assets', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...assetInput, assetTag: '' }) }), 400, 'VALIDATION_ERROR', 'assetTag');
	await expectItAssetError(await request('/v1/it-assets', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...assetInput, assetTag: `BAD-123`, serialNumber: `BAD_PREFIX_${suffix}` }) }), 400, 'VALIDATION_ERROR', 'assetTag');
	await expectItAssetError(await request('/v1/it-assets', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...assetInput, assetTag: `${type.managementCodePrefix}-0123`, serialNumber: `FOUR_DIGIT_${suffix}` }) }), 400, 'VALIDATION_ERROR', 'assetTag');
	const assetResponse = await request('/v1/it-assets', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(assetInput) });
	if (assetResponse.status !== 201) throw new Error(`IT asset verification failed (${assetResponse.status}).`);
	const asset = (await payload(assetResponse)).data;
	if (asset.assetTag !== preview) throw new Error('IT asset code allocation differs from the preview without concurrent writes.');
	const legacyCode = `${type.managementCodePrefix}-${asset.assetTag.split('-')[1].padStart(4, '0')}`;
	await client.query(`WITH updated AS (
		UPDATE it_assets SET asset_tag = $1 WHERE id = $2 RETURNING id
	) INSERT INTO it_asset_management_codes (code, asset_id) SELECT $1, id FROM updated`, [legacyCode, asset.id]);
	asset.assetTag = legacyCode;
	const retainedLegacyCode = await request(`/v1/it-assets/${asset.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...assetInput, assetTag: legacyCode }) });
	if (retainedLegacyCode.status !== 200 || (await payload(retainedLegacyCode)).data.assetTag !== legacyCode) throw new Error('Unchanged legacy management code was not retained.');
	await expectItAssetError(await request(`/v1/it-assets/${asset.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...assetInput, assetTag: `${type.managementCodePrefix}-9999` }) }), 400, 'VALIDATION_ERROR', 'assetTag');
	await expectItAssetError(await request('/v1/it-assets', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(assetInput) }), 409, 'IT_ASSET_FIELD_CONFLICT', 'serialNumber');
	await expectItAssetError(await request(`/v1/it-assets/${asset.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...assetInput, statusId: 0 }) }), 400, 'VALIDATION_ERROR', 'statusId');
	const secondInput = { ...assetInput, serialNumber: `SECOND_SER_${suffix}` };
	const thirdInput = { ...assetInput, serialNumber: `THIRD_SER_${suffix}`, assigneeId: employeeId };
	const [secondResponse, thirdResponse] = await Promise.all([secondInput, thirdInput].map(input => request('/v1/it-assets', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) })));
	if (secondResponse.status !== 201 || thirdResponse.status !== 201) throw new Error('Concurrent IT asset creation failed.');
	const secondAsset = (await payload(secondResponse)).data;
	const thirdAsset = (await payload(thirdResponse)).data;
	const secondOriginalCode = secondAsset.assetTag;
	if (thirdAsset.assignments[0]?.employee.id !== employeeId) throw new Error('IT asset creation and assignment were not atomic.');
	const usageLists = {};
	for (const path of ['/v1/branches', '/v1/rooms', '/v1/storage', '/v1/it-asset-types', '/v1/manufacturers', '/v1/cpu-types', '/v1/operating-systems', '/v1/it-asset-statuses']) {
		const response = await request(`${path}?limit=500`);
		const result = await payload(response);
		if (response.status !== 200 || result.data.some((entry) => !Number.isSafeInteger(entry.usageCount) || entry.usageCount < 0)) throw new Error(`Master usage count contract failed (${path}).`);
		usageLists[path] = result.data;
	}
	const usageCount = (path, id) => usageLists[path].find((entry) => entry.id === id)?.usageCount;
	if (usageCount('/v1/branches', branch.id) !== 1 || usageCount('/v1/rooms', room.id) !== 1 || usageCount('/v1/storage', storage.id) !== 3) throw new Error('Location master usage counts are incorrect.');
	if (usageCount('/v1/it-asset-types', type.id) !== 3 || usageCount('/v1/manufacturers', manufacturer.id) !== 4 || usageCount('/v1/cpu-types', cpuType.id) !== 0 || usageCount('/v1/operating-systems', operatingSystem.id) !== 0 || usageCount('/v1/it-asset-statuses', status.id) !== 3) throw new Error('IT asset master usage counts are incorrect.');
	const createdHistory = await payload(await request(`/v1/it-assets/${thirdAsset.id}/history`));
	if (createdHistory.meta.total !== 1 || createdHistory.data[0]?.action !== 'create' ||
		!createdHistory.data[0].changes.some(change => change.field === 'assigneeId' && change.after)) throw new Error('Initial IT asset change history did not retain its assignee.');
	const brokenStatus = statuses.find((entry) => entry.name === 'Broken');
	if (!brokenStatus) throw new Error('Broken status is unavailable.');
	const brokenResponse = await request(`/v1/it-assets/${secondAsset.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...secondInput, statusId: brokenStatus.id, assigneeId: employeeId }) });
	if (brokenResponse.status !== 200 || (await payload(brokenResponse)).data.assignments[0]?.employee.id !== employeeId) throw new Error('Atomic IT asset status and assignment update failed.');
	const historyResponse = await request(`/v1/it-assets/${secondAsset.id}/history?sortBy=changedAt&sortOrder=desc&limit=10`);
	const history = await payload(historyResponse);
	if (historyResponse.status !== 200 || history.meta.total !== 2 || !history.data.some((entry) => entry.action === 'update' && entry.changes.some(change => change.field === 'statusId' && change.after === brokenStatus.name) && entry.changes.some(change => change.field === 'assigneeId' && change.after))) throw new Error('Combined IT asset status and assignee changes were not recorded.');
	const unassignResponse = await request(`/v1/it-assets/${secondAsset.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...secondInput, assigneeId: null }) });
	if (unassignResponse.status !== 200 || (await payload(unassignResponse)).data.assignments.length !== 0) throw new Error('Atomic IT asset unassignment failed.');
	const returnedHistory = await payload(await request(`/v1/it-assets/${secondAsset.id}/history`));
	if (!returnedHistory.data.some((entry) => entry.action === 'update' && entry.changes.some(change => change.field === 'assigneeId' && change.after === null))) throw new Error('IT asset unassignment was not recorded.');
	const unassignThird = await request(`/v1/it-assets/${thirdAsset.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...thirdInput, assigneeId: null }) });
	if (unassignThird.status !== 200) throw new Error('IT asset creation assignment cleanup failed.');
	if (new Set([asset.assetTag, secondAsset.assetTag, thirdAsset.assetTag]).size !== 3) throw new Error('Concurrent management codes are not unique.');
	for (const field of ['type', 'manufacturer', 'branch', 'room', 'storage', 'user', 'status']) {
		for (const order of ['asc', 'desc']) {
			const response = await request(`/v1/it-assets?sortBy=${field}&sortOrder=${order}&offset=0&limit=2`);
			if (response.status !== 200) throw new Error(`IT asset ${field} sort failed (${response.status}).`);
			const result = await payload(response);
			if (result.data.length > 2 || result.meta.limit !== 2 || result.meta.sort.field !== field) throw new Error(`IT asset ${field} paging metadata failed.`);
		}
	}
	const searchedAssets = await request(`/v1/it-assets?q=${encodeURIComponent(manufacturer.name)}&sortBy=assetTag&limit=1`);
	if (searchedAssets.status !== 200 || (await payload(searchedAssets)).meta.total < 3) throw new Error('IT asset manufacturer search failed.');
	const searchedUserSort = await request(`/v1/it-assets?q=${encodeURIComponent(manufacturer.name)}&sortBy=user&limit=2`);
	if (searchedUserSort.status !== 200 || (await payload(searchedUserSort)).data.length !== 2) throw new Error('IT asset user sort with search failed.');
	const wildcardSearch = await request('/v1/it-assets?q=%25&sortBy=user&limit=2');
	const wildcardResult = await payload(wildcardSearch);
	if (wildcardSearch.status !== 200 || wildcardResult.meta.total < 3 || wildcardResult.data.length !== 2) throw new Error('IT asset wildcard search and paging disagree.');
	await expectItAssetError(await request(`/v1/it-assets/${secondAsset.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...secondInput, serialNumber: assetInput.serialNumber }) }), 409, 'IT_ASSET_FIELD_CONFLICT', 'serialNumber');
	const updatedSecond = await request(`/v1/it-assets/${secondAsset.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...secondInput, modelNumber: 'Updated verification model' }) });
	if (updatedSecond.status !== 200 || (await payload(updatedSecond)).data.assetTag !== secondAsset.assetTag) throw new Error(`Same-type management code changed (${updatedSecond.status}).`);
	await expectItAssetError(await request(`/v1/it-assets/${secondAsset.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...secondInput, assetTag: `BAD-123` }) }), 400, 'VALIDATION_ERROR', 'assetTag');
	const manualCode = `${type.managementCodePrefix}-998`;
	const manualCodeUpdate = await request(`/v1/it-assets/${secondAsset.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...secondInput, assetTag: manualCode }) });
	if (manualCodeUpdate.status !== 200 || (await payload(manualCodeUpdate)).data.assetTag !== manualCode) throw new Error('Manual management code update failed.');
	await expectItAssetError(await request(`/v1/it-assets/${thirdAsset.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...thirdInput, assetTag: secondOriginalCode }) }), 409, 'IT_ASSET_FIELD_CONFLICT', 'assetTag');
	const fieldHistory = await payload(await request(`/v1/it-assets/${secondAsset.id}/history`));
	if (!fieldHistory.data.some(entry => entry.changes.some(change => change.field === 'modelNumber' && change.after === 'Updated verification model')) || !fieldHistory.data.some(entry => entry.changes.some(change => change.field === 'assetTag' && change.after === manualCode))) throw new Error('IT asset field change was not recorded.');
	const manualCreateCode = `${type.managementCodePrefix}-997`;
	const manualCreateInput = { ...assetInput, assetTag: manualCreateCode, serialNumber: `MANUAL_CREATE_${suffix}` };
	const manualCreateResponse = await request('/v1/it-assets', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(manualCreateInput) });
	if (manualCreateResponse.status !== 201 || (await payload(manualCreateResponse)).data.assetTag !== manualCreateCode) throw new Error('Manual management code creation failed.');
	const manualAsset = (await payload(await request(`/v1/it-assets?q=${encodeURIComponent(manualCreateCode)}&limit=1`))).data[0];
	if (!manualAsset || (await request(`/v1/it-assets/${manualAsset.id}`, { method: 'DELETE' })).status !== 200) throw new Error('Manual management code cleanup failed.');
	await expectItAssetError(await request('/v1/it-assets', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...manualCreateInput, serialNumber: `MANUAL_REUSE_${suffix}` }) }), 409, 'IT_ASSET_FIELD_CONFLICT', 'assetTag');
	const movedSecond = await request(`/v1/it-assets/${secondAsset.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...secondInput, typeId: displayType.id }) });
	if (movedSecond.status !== 200 || !new RegExp('^DSP-[0-9]{3}$').test((await payload(movedSecond)).data.assetTag)) throw new Error('Type-change management code allocation failed.');
	const fourthResponse = await request('/v1/it-assets', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...assetInput, serialNumber: `FOURTH_SER_${suffix}` }) });
	if (fourthResponse.status !== 201) throw new Error(`Fourth IT asset verification failed (${fourthResponse.status}).`);
	const fourthAsset = (await payload(fourthResponse)).data;
	if (Number(fourthAsset.assetTag.split('-')[1]) <= Number(thirdAsset.assetTag.split('-')[1])) throw new Error('Reassigned management code was reused.');
	const removedSecond = await request(`/v1/it-assets/${secondAsset.id}`, { method: 'DELETE' });
	if (removedSecond.status !== 200) throw new Error(`Second IT asset delete verification failed (${removedSecond.status}).`);
	const deletedHistory = await client.query("SELECT count(*)::int AS count FROM it_asset_change_history WHERE asset_id = $1 AND action = 'delete'", [secondAsset.id]);
	if (deletedHistory.rows[0]?.count !== 1) throw new Error('IT asset deletion was not recorded.');
	for (const item of [thirdAsset, fourthAsset]) { const response = await request(`/v1/it-assets/${item.id}`, { method: 'DELETE' }); if (response.status !== 200) throw new Error(`Extra IT asset delete verification failed (${response.status}).`); }
	const afterDeleteResponse = await request('/v1/it-assets', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...assetInput, serialNumber: `AFTER_DELETE_${suffix}` }) });
	if (afterDeleteResponse.status !== 201) throw new Error(`Post-delete IT asset creation failed (${afterDeleteResponse.status}).`);
	const afterDeleteAsset = (await payload(afterDeleteResponse)).data;
	if (Number(afterDeleteAsset.assetTag.split('-')[1]) <= Number(fourthAsset.assetTag.split('-')[1])) throw new Error('A soft-deleted management code was reused.');
	const removedAfterDelete = await request(`/v1/it-assets/${afterDeleteAsset.id}`, { method: 'DELETE' });
	if (removedAfterDelete.status !== 200) throw new Error(`Post-delete IT asset cleanup failed (${removedAfterDelete.status}).`);
	const calendarResponse = await request('/v1/work-calendars', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: `Calendar ${suffix}`, calendarYear: 2030, scheduledWorkMinutesPerDay: 465, description: 'API verification calendar' }) });
	if (calendarResponse.status !== 201) throw new Error(`Work calendar create verification failed (${calendarResponse.status}).`);
	const workCalendar = (await payload(calendarResponse)).data;
	const calendarUpdate = await request(`/v1/work-calendars/${workCalendar.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: `Updated calendar ${suffix}`, calendarYear: 2030, scheduledWorkMinutesPerDay: 465, description: 'Updated API verification calendar' }) });
	if (calendarUpdate.status !== 200) throw new Error(`Work calendar update verification failed (${calendarUpdate.status}).`);
	const workingDayResponse = await request(`/v1/work-calendars/${workCalendar.id}/entries`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ workDate: '2030-04-01', entryType: 'working_day', title: 'Verification day', note: 'Verification note' }) });
	if (workingDayResponse.status !== 201) throw new Error(`Calendar entry create verification failed (${workingDayResponse.status}).`);
	const workingDay = (await payload(workingDayResponse)).data;
	const duplicateWorkingDay = await request(`/v1/work-calendars/${workCalendar.id}/entries`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ workDate: '2030-04-01', entryType: 'company_holiday', title: 'Duplicate' }) });
	if (duplicateWorkingDay.status !== 409) throw new Error(`Calendar entry duplicate guard failed (${duplicateWorkingDay.status}).`);
	await payload(duplicateWorkingDay);
	const workingDayUpdate = await request(`/v1/work-calendars/${workCalendar.id}/entries/${workingDay.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ workDate: '2030-04-02', entryType: 'company_holiday', title: 'Updated verification holiday', note: null }) });
	if (workingDayUpdate.status !== 200) throw new Error(`Calendar entry update verification failed (${workingDayUpdate.status}).`);
	const calendarAssignments = await request(`/v1/work-calendars/${workCalendar.id}/employees`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ employeeIds: [employeeId] }) });
	if (calendarAssignments.status !== 200 || !(await payload(calendarAssignments)).data.some(entry => entry.id === employeeId)) throw new Error('Work calendar employee assignment failed.');
	const calendarList = await request('/v1/work-calendars?sortBy=name&sortOrder=asc&limit=100');
	const calendarListPayload = await payload(calendarList);
	if (calendarList.status !== 200 || !calendarListPayload.data.some(entry => entry.id === workCalendar.id)) throw new Error('Work calendar list verification failed.');
	const invalidCalendarLimit = await request('/v1/work-calendars?limit=0');
	if (invalidCalendarLimit.status !== 422) throw new Error(`Work calendar limit guard failed (${invalidCalendarLimit.status}).`);
	await payload(invalidCalendarLimit);
	const invalidHolidayImport = await request('/v1/calendar-holiday-imports', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
	if (invalidHolidayImport.status !== 400 || (await payload(invalidHolidayImport)).error.code !== 'INVALID_REQUEST') throw new Error('Holiday import calendar validation failed.');
	const missingHolidayCalendar = await request('/v1/calendar-holiday-imports', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ workCalendarId: 2147483647 }) });
	if (missingHolidayCalendar.status !== 404 || (await payload(missingHolidayCalendar)).error.code !== 'NOT_FOUND') throw new Error('Holiday import missing calendar guard failed.');
	const externalLinkInput = { name: `External link ${suffix}`, url: `https://example.com/${suffix.toLowerCase()}`, sortOrder: 10 };
	const invalidExternalScheme = await request('/v1/external-links', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...externalLinkInput, url: 'javascript:alert(1)' }) });
	if (invalidExternalScheme.status !== 400 || (await payload(invalidExternalScheme)).error.code !== 'VALIDATION_ERROR') throw new Error('External link URL scheme validation failed.');
	const invalidExternalCredentials = await request('/v1/external-links', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...externalLinkInput, url: 'https://user:password@example.com/' }) });
	if (invalidExternalCredentials.status !== 400 || (await payload(invalidExternalCredentials)).error.code !== 'VALIDATION_ERROR') throw new Error('External link credential validation failed.');
	const externalLinkResponse = await request('/v1/external-links', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(externalLinkInput) });
	if (externalLinkResponse.status !== 201) throw new Error(`External link create failed (${externalLinkResponse.status}).`);
	const externalLink = (await payload(externalLinkResponse)).data;
	const duplicateExternalLink = await request('/v1/external-links', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(externalLinkInput) });
	if (duplicateExternalLink.status !== 409 || (await payload(duplicateExternalLink)).error.code !== 'DUPLICATE_VALUE') throw new Error('External link duplicate guard failed.');
	const externalLinkUpdate = await request(`/v1/external-links/${externalLink.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...externalLinkInput, url: `${externalLinkInput.url}/updated`, sortOrder: 20 }) });
	if (externalLinkUpdate.status !== 200 || (await payload(externalLinkUpdate)).data.sortOrder !== 20) throw new Error('External link update failed.');
	const externalLinkList = await request(`/v1/external-links?q=${encodeURIComponent(suffix)}&sortBy=sortOrder&sortOrder=asc&limit=500`);
	if (externalLinkList.status !== 200 || !(await payload(externalLinkList)).data.some((item) => item.id === externalLink.id)) throw new Error('External link search or list failed.');
	const invalidExternalLimit = await request('/v1/external-links?limit=0');
	if (invalidExternalLimit.status !== 422) throw new Error(`External link list limit guard failed (${invalidExternalLimit.status}).`);
	await payload(invalidExternalLimit);
	await client.query('UPDATE employee_roles SET role_id = $1 WHERE id = $2', [roleByCode.general_user, roleGrantId]);
	const forbidden = await request('/v1/departments', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: `Denied ${suffix}` }) });
	if (forbidden.status !== 403 || (await payload(forbidden)).error.code !== 'ADMIN_REQUIRED') throw new Error('Employee role guard verification failed.');
	const generalEmployeeList = await request('/v1/employees?limit=1');
	if (generalEmployeeList.status !== 200 || (await payload(generalEmployeeList)).meta.total < 1) throw new Error('General user employee read verification failed.');
	const profileResponse = await request('/v1/employees/me');
	if (profileResponse.status !== 200) throw new Error(`Employee self-profile read failed (${profileResponse.status}).`);
	const originalProfile = (await payload(profileResponse)).data;
	if (originalProfile.id !== employeeId || Object.hasOwn(originalProfile, 'employeeCode') || Object.hasOwn(originalProfile, 'roles')) throw new Error('Employee self-profile response exposed non-profile fields.');
	const profileInput = selfProfileInput(originalProfile);
	const selfUpdate = await request('/v1/employees/me', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...profileInput, firstName: 'Self Updated' }) });
	if (selfUpdate.status !== 200 || (await payload(selfUpdate)).data.firstName !== 'Self Updated') throw new Error('General user self-profile update failed.');
	const forbiddenSelfUpdate = await request('/v1/employees/me', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...profileInput, employeeCode: 'FORBIDDEN01', roleCodes: ['system_administrator'] }) });
	await expectEmployeeError(forbiddenSelfUpdate, 400, 'VALIDATION_ERROR', 'employeeCode');
	const unchangedProfile = await request('/v1/employees/me');
	if (unchangedProfile.status !== 200 || (await payload(unchangedProfile)).data.firstName !== 'Self Updated') throw new Error('Forbidden self-profile fields changed employee data.');
	const restoredProfile = await request('/v1/employees/me', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(profileInput) });
	if (restoredProfile.status !== 200) throw new Error('Employee self-profile could not be restored.');
	for (const [path, method] of [['/v1/employees', 'POST'], [`/v1/employees/${employee.id}`, 'PATCH'], [`/v1/employees/${employee.id}`, 'DELETE']]) {
		const response = await request(path, { method, ...(method === 'DELETE' ? {} : { headers: { 'content-type': 'application/json' }, body: '{}' }) });
		if (response.status !== 403 || (await payload(response)).error.code !== 'ADMIN_REQUIRED') throw new Error(`General user employee ${method} guard failed.`);
	}
	const forbiddenEmployeeExport = await request('/v1/employees?includeColumns=true&limit=500');
	if (forbiddenEmployeeExport.status !== 403 || (await payload(forbiddenEmployeeExport)).error.code !== 'ADMIN_REQUIRED') throw new Error('Employee export metadata role guard verification failed.');
	const forbiddenRoleList = await request('/v1/roles');
	if (forbiddenRoleList.status !== 403 || (await payload(forbiddenRoleList)).error.code !== 'ADMIN_REQUIRED') throw new Error('Role list guard verification failed.');
	const readableMasters = await request('/v1/departments');
	if (readableMasters.status !== 200) throw new Error(`General user master read verification failed (${readableMasters.status}).`);
	await payload(readableMasters);
	const generalExternalLinks = await request('/v1/external-links?limit=500');
	if (generalExternalLinks.status !== 200 || !(await payload(generalExternalLinks)).data.some((item) => item.id === externalLink.id)) throw new Error('General user external link read failed.');
	for (const [path, method, body] of [['/v1/external-links', 'POST', externalLinkInput], [`/v1/external-links/${externalLink.id}`, 'PATCH', externalLinkInput], [`/v1/external-links/${externalLink.id}`, 'DELETE', null]]) {
		const response = await request(path, { method, ...(body ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}) });
		if (response.status !== 403 || (await payload(response)).error.code !== 'SYSTEM_ADMIN_REQUIRED') throw new Error(`General user external link ${method} guard failed.`);
	}
	for (const path of ['/v1/work-calendars', `/v1/work-calendars/${workCalendar.id}/entries?limit=500`, `/v1/work-calendars/${workCalendar.id}/employees?limit=500`, '/v1/calendar-date-attributes?from=2030-04-01&to=2030-04-30&limit=500']) {
		const response = await request(path);
		if (response.status !== 200) throw new Error(`General user work calendar read failed for ${path} (${response.status}).`);
		await payload(response);
	}
	for (const [path, method, body] of [['/v1/work-calendars', 'POST', { name: `Denied ${suffix}`, calendarYear: 2030 }], [`/v1/work-calendars/${workCalendar.id}`, 'PATCH', { name: 'Denied', calendarYear: 2030 }], [`/v1/work-calendars/${workCalendar.id}`, 'DELETE', null], [`/v1/work-calendars/${workCalendar.id}/entries`, 'POST', { workDate: '2030-05-01', entryType: 'working_day', title: 'Denied' }], [`/v1/work-calendars/${workCalendar.id}/entries/${workingDay.id}`, 'PATCH', { workDate: '2030-05-02', entryType: 'working_day', title: 'Denied' }], [`/v1/work-calendars/${workCalendar.id}/entries/${workingDay.id}`, 'DELETE', null], [`/v1/work-calendars/${workCalendar.id}/employees`, 'PUT', { employeeIds: [] }], ['/v1/calendar-holiday-imports', 'POST', { workCalendarId: workCalendar.id }]]) {
		const response = await request(path, { method, ...(body ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}) });
		if (response.status !== 403 || (await payload(response)).error.code !== 'SYSTEM_ADMIN_REQUIRED') throw new Error(`General user work calendar ${method} guard failed for ${path}.`);
	}
	for (const [path, expectedCode, body] of [['/v1/branches', 'SYSTEM_ADMIN_REQUIRED', { name: `General branch ${suffix}` }], ['/v1/rooms', 'ADMIN_REQUIRED', { name: `General room ${suffix}`, branchId: branch.id }], ['/v1/storage', 'ADMIN_REQUIRED', { name: `General storage ${suffix}`, branchId: branch.id, roomId: room.id }]]) {
		const response = await request(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
		if (response.status !== 403 || (await payload(response)).error.code !== expectedCode) throw new Error(`General user location write guard failed for ${path}.`);
	}
	const generalAssetResponse = await request('/v1/it-assets', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...assetInput, serialNumber: `USER_SER_${suffix}` }) });
	if (generalAssetResponse.status !== 201) throw new Error(`General user asset write verification failed (${generalAssetResponse.status}).`);
	const generalAsset = (await payload(generalAssetResponse)).data;
	const removedGeneralAsset = await request(`/v1/it-assets/${generalAsset.id}`, { method: 'DELETE' });
	if (removedGeneralAsset.status !== 200) throw new Error(`General user asset delete verification failed (${removedGeneralAsset.status}).`);
	const assignmentResponse = await request(`/v1/it-assets/${asset.id}/assignments`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ employeeId }) });
	if (assignmentResponse.status !== 201) throw new Error(`IT asset assignment verification failed (${assignmentResponse.status}).`);
	const assignment = (await payload(assignmentResponse)).data;
	const assignedDelete = await request(`/v1/it-assets/${asset.id}`, { method: 'DELETE' });
	if (assignedDelete.status !== 409) throw new Error(`IT asset assignment guard failed (${assignedDelete.status}).`);
	const returned = await request(`/v1/it-assets/${asset.id}/assignments/${assignment.id}`, { method: 'PATCH' });
	if (returned.status !== 200) throw new Error(`IT asset return verification failed (${returned.status}).`);
	const assignmentHistory = await payload(await request(`/v1/it-assets/${asset.id}/history`));
	if (!assignmentHistory.data.some(entry => entry.action === 'assign' && entry.changes.some(change => change.field === 'assigneeId' && change.after)) ||
		!assignmentHistory.data.some(entry => entry.action === 'return' && entry.changes.some(change => change.field === 'assigneeId' && change.after === null))) throw new Error('Standalone assignment history was not recorded.');
	await client.query('UPDATE employee_roles SET role_id = $1 WHERE id = $2', [roleByCode.business_administrator, roleGrantId]);
	const businessMaster = await request('/v1/departments', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: `Business administrator ${suffix}` }) });
	if (businessMaster.status !== 201) throw new Error(`Business administrator master write verification failed (${businessMaster.status}).`);
	const businessItem = (await payload(businessMaster)).data;
	const removedBusinessMaster = await request(`/v1/departments/${businessItem.id}`, { method: 'DELETE' });
	if (removedBusinessMaster.status !== 200) throw new Error(`Business administrator master delete verification failed (${removedBusinessMaster.status}).`);
	await payload(removedBusinessMaster);
	const businessCalendarRead = await request(`/v1/work-calendars/${workCalendar.id}`);
	if (businessCalendarRead.status !== 200) throw new Error(`Business administrator work calendar read failed (${businessCalendarRead.status}).`);
	await payload(businessCalendarRead);
	const forbiddenBusinessCalendar = await request(`/v1/work-calendars/${workCalendar.id}/entries`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ workDate: '2030-06-01', entryType: 'working_day', title: 'Denied' }) });
	if (forbiddenBusinessCalendar.status !== 403 || (await payload(forbiddenBusinessCalendar)).error.code !== 'SYSTEM_ADMIN_REQUIRED') throw new Error('Business administrator work calendar write guard failed.');
	const businessExternalLinks = await request('/v1/external-links?limit=500');
	if (businessExternalLinks.status !== 200 || !(await payload(businessExternalLinks)).data.some((item) => item.id === externalLink.id)) throw new Error('Business administrator external link read failed.');
	for (const [path, method, body] of [['/v1/external-links', 'POST', externalLinkInput], [`/v1/external-links/${externalLink.id}`, 'PATCH', externalLinkInput], [`/v1/external-links/${externalLink.id}`, 'DELETE', null]]) {
		const response = await request(path, { method, ...(body ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}) });
		if (response.status !== 403 || (await payload(response)).error.code !== 'SYSTEM_ADMIN_REQUIRED') throw new Error(`Business administrator external link ${method} guard failed.`);
	}
	for (const [path, method] of [['/v1/branches', 'POST'], [`/v1/branches/${branch.id}`, 'PATCH'], [`/v1/branches/${branch.id}`, 'DELETE']]) {
		const forbiddenBusinessBranch = await request(path, { method, ...(method === 'DELETE' ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: `Business branch ${suffix}` }) }) });
		if (forbiddenBusinessBranch.status !== 403 || (await payload(forbiddenBusinessBranch)).error.code !== 'SYSTEM_ADMIN_REQUIRED') throw new Error(`Business administrator branch ${method} guard failed.`);
	}
	const businessRoomResponse = await request('/v1/rooms', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: `Business room ${suffix}`, branchId: branch.id }) });
	if (businessRoomResponse.status !== 201) throw new Error(`Business administrator room create failed (${businessRoomResponse.status}).`);
	const businessRoom = (await payload(businessRoomResponse)).data;
	const businessStorageResponse = await request('/v1/storage', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: `Business storage ${suffix}`, branchId: branch.id, roomId: businessRoom.id }) });
	if (businessStorageResponse.status !== 201) throw new Error(`Business administrator storage create failed (${businessStorageResponse.status}).`);
	const businessStorage = (await payload(businessStorageResponse)).data;
	if ((await request(`/v1/storage/${businessStorage.id}`, { method: 'DELETE' })).status !== 200 || (await request(`/v1/rooms/${businessRoom.id}`, { method: 'DELETE' })).status !== 200) throw new Error('Business administrator location cleanup failed.');
	await client.query('UPDATE employee_roles SET role_id = $1 WHERE id = $2', [originalRole, roleGrantId]);
	const removedExternalLink = await request(`/v1/external-links/${externalLink.id}`, { method: 'DELETE' });
	if (removedExternalLink.status !== 200) throw new Error(`External link soft delete failed (${removedExternalLink.status}).`);
	await payload(removedExternalLink);
	const hiddenExternalLinks = await payload(await request(`/v1/external-links?q=${encodeURIComponent(suffix)}&limit=500`));
	if (hiddenExternalLinks.data.some((item) => item.id === externalLink.id)) throw new Error('Soft-deleted external link remained visible.');
	const restoredExternalLink = await request('/v1/external-links', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(externalLinkInput) });
	if (restoredExternalLink.status !== 201 || (await payload(restoredExternalLink)).data.id !== externalLink.id) throw new Error('Soft-deleted external link was not restored.');
	if ((await request(`/v1/external-links/${externalLink.id}`, { method: 'DELETE' })).status !== 200) throw new Error('Restored external link cleanup failed.');
	const removedWorkCalendar = await request(`/v1/work-calendars/${workCalendar.id}`, { method: 'DELETE' });
	if (removedWorkCalendar.status !== 200) throw new Error(`Work calendar delete verification failed (${removedWorkCalendar.status}).`);
	await payload(removedWorkCalendar);
	const retainedCalendarData = await client.query('SELECT (SELECT deleted_at IS NOT NULL FROM work_calendars WHERE id = $1) AS calendar_deleted, (SELECT deleted_at IS NOT NULL FROM work_calendar_days WHERE id = $2) AS day_deleted, (SELECT work_calendar_id IS NULL FROM employees WHERE id = $3) AS assignment_cleared', [workCalendar.id, workingDay.id, employeeId]);
	if (!retainedCalendarData.rows[0]?.calendar_deleted || !retainedCalendarData.rows[0]?.day_deleted || !retainedCalendarData.rows[0]?.assignment_cleared) throw new Error('Work calendar soft deletion or assignment cleanup failed.');
	const referencedStorage = await request(`/v1/storage/${storage.id}`, { method: 'DELETE' });
	if (referencedStorage.status !== 409) throw new Error(`Reference guard verification failed (${referencedStorage.status}).`);
	const removedAsset = await request(`/v1/it-assets/${asset.id}`, { method: 'DELETE' });
	if (removedAsset.status !== 200) throw new Error(`IT asset soft-delete verification failed (${removedAsset.status}).`);
	const removedCpuType = await request(`/v1/cpu-types/${cpuType.id}`, { method: 'DELETE' });
	if (removedCpuType.status !== 200) throw new Error(`CPU type soft-delete verification failed (${removedCpuType.status}).`);
	const removedOperatingSystem = await request(`/v1/operating-systems/${operatingSystem.id}`, { method: 'DELETE' });
	if (removedOperatingSystem.status !== 200) throw new Error(`Operating system soft-delete verification failed (${removedOperatingSystem.status}).`);
	const removedManufacturer = await request(`/v1/manufacturers/${manufacturer.id}`, { method: 'DELETE' });
	if (removedManufacturer.status !== 200) throw new Error(`Manufacturer soft-delete verification failed (${removedManufacturer.status}).`);
	const removedStorage = await request(`/v1/storage/${storage.id}`, { method: 'DELETE' });
	if (removedStorage.status !== 200) throw new Error(`Storage soft-delete verification failed (${removedStorage.status}).`);
	const removedRoom = await request(`/v1/rooms/${room.id}`, { method: 'DELETE' });
	if (removedRoom.status !== 200) throw new Error(`Room soft-delete verification failed (${removedRoom.status}).`);
	const removedBranch = await request(`/v1/branches/${branch.id}`, { method: 'DELETE' });
	if (removedBranch.status !== 200) throw new Error(`Branch soft-delete verification failed (${removedBranch.status}).`);
	const retainedAssets = await client.query('SELECT (SELECT deleted_at IS NOT NULL FROM storage WHERE id = $1) AND (SELECT deleted_at IS NOT NULL FROM rooms WHERE id = $2) AND (SELECT deleted_at IS NOT NULL FROM branches WHERE id = $3) AND (SELECT deleted_at IS NOT NULL FROM it_assets WHERE id = $4) AS deleted', [storage.id, room.id, branch.id, asset.id]);
	if (!retainedAssets.rows[0]?.deleted) throw new Error('Related records were not retained as soft-deleted data.');
	const lastSystemAdminDelete = await request(`/v1/employees/${employeeId}`, { method: 'DELETE' });
	if (lastSystemAdminDelete.status !== 409 || (await payload(lastSystemAdminDelete)).error.code !== 'LAST_SYSTEM_ADMINISTRATOR') throw new Error('Last system administrator guard verification failed.');
	const administratorList = await request('/v1/employees?sortBy=employeeCode&sortOrder=asc&offset=0&limit=500');
	const administrator = (await payload(administratorList)).data.find((entry) => entry.id === employeeId);
	if (!administrator) throw new Error('System administrator employee record was not returned.');
	const lastSystemRoleRemoval = await request(`/v1/employees/${employeeId}`, {
		method: 'PATCH',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			...administrator,
			birthDate: administrator.birthDate.slice(0, 10),
			hiredAt: administrator.hiredAt.slice(0, 10),
			retiredAt: administrator.retiredAt?.slice(0, 10) ?? null,
			roleCodes: ['general_user']
		})
	});
	if (lastSystemRoleRemoval.status !== 409 || (await payload(lastSystemRoleRemoval)).error.code !== 'LAST_SYSTEM_ADMINISTRATOR') throw new Error('Last system administrator role removal guard failed.');

	const logout = await request('/v1/auth/logout', { method: 'POST' });
	if (logout.status !== 200) throw new Error(`Logout verification failed (${logout.status}).`);
	await payload(logout);
	cookie = undefined;
	const emailLogin = await request('/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identifier: configuredEmail, password }) });
	if (emailLogin.status !== 200) throw new Error(`Email login verification failed (${emailLogin.status}).`);
	await payload(emailLogin);
	cookie = emailLogin.headers.get('set-cookie')?.split(';')[0];
	if (!cookie) throw new Error('Email login did not issue a session cookie.');
	const emailSession = await request('/v1/auth/session');
	if (emailSession.status !== 200 || (await payload(emailSession)).data.user.email !== configuredEmail) throw new Error('Session email verification failed.');
	const emailLogout = await request('/v1/auth/logout', { method: 'POST' });
	if (emailLogout.status !== 200) throw new Error(`Email logout verification failed (${emailLogout.status}).`);
	await payload(emailLogout);
	cookie = undefined;
	await client.query('UPDATE employees SET must_change_credentials = true WHERE id = $1', [employeeId]);
	const onboardingLogin = await request('/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identifier: configuredEmail, password }) });
	if (onboardingLogin.status !== 200) throw new Error(`Onboarding login verification failed (${onboardingLogin.status}).`);
	cookie = onboardingLogin.headers.get('set-cookie')?.split(';')[0];
	if (!cookie) throw new Error('Onboarding login did not issue a session cookie.');
	const nextPassword = `VerifyA${suffix.toLowerCase()}9`;
	const onboarding = await request('/v1/auth/onboarding', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: nextPassword }) });
	if (onboarding.status !== 200) throw new Error(`Password-only onboarding verification failed (${onboarding.status}).`);
	await payload(onboarding);
	const onboardingAccount = await client.query('SELECT email, must_change_credentials FROM employees WHERE id = $1', [employeeId]);
	if (onboardingAccount.rows[0]?.email !== configuredEmail || onboardingAccount.rows[0]?.must_change_credentials !== false) throw new Error('Onboarding changed the configured email or did not finish.');
	cookie = undefined;
	const changedPasswordLogin = await request('/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identifier: configuredEmail, password: nextPassword }) });
	if (changedPasswordLogin.status !== 200) throw new Error(`Changed password login verification failed (${changedPasswordLogin.status}).`);
	cookie = changedPasswordLogin.headers.get('set-cookie')?.split(';')[0];
	if (!cookie) throw new Error('Changed password login did not issue a session cookie.');
	const changedPasswordLogout = await request('/v1/auth/logout', { method: 'POST' });
	if (changedPasswordLogout.status !== 200) throw new Error(`Changed password logout verification failed (${changedPasswordLogout.status}).`);
	await payload(changedPasswordLogout);
	console.log(JSON.stringify({ unauthenticated: 401, forbidden: 403, login: 200, sessionTimestampUtc: true, create: 201, update: 200, delete: 200, repeatedDelete: 404, list: 200, invalidLimit: 422, employeeContract: true, selfProfileContract: true, referenceGuard: 409, itAssetAssignmentGuard: 409, relatedSoftDelete: true, logout: 200, softDeleteVerified: true }));
} finally {
	if (employeeId !== undefined && originalMustChange !== undefined && originalRole !== undefined && originalPasswordHash !== undefined) {
		await client.query('UPDATE employees SET must_change_credentials = $1, password_hash = $2 WHERE id = $3', [originalMustChange, originalPasswordHash, employeeId]).catch(() => undefined);
		await client.query('UPDATE employee_roles SET role_id = $1 WHERE id = $2', [originalRole, roleGrantId]).catch(() => undefined);
	}
	await client.end();
}
