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
	const unauthenticatedCodePreview = await request('/v1/it-asset-code-previews?typeId=1');
	if (unauthenticatedCodePreview.status !== 401) throw new Error(`Management code preview guard failed (${unauthenticatedCodePreview.status}).`);
	await payload(unauthenticatedCodePreview);

	const login = await request('/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identifier: username, password }) });
	const loginPayload = await payload(login);
	if (login.status !== 200) throw new Error(`Login verification failed (${login.status}/${loginPayload.error?.code ?? 'UNKNOWN'}).`);
	cookie = login.headers.get('set-cookie')?.split(';')[0];
	if (!cookie) throw new Error('Login did not issue a session cookie.');
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
	const code = `VERIFY_${suffix}`;
	const created = await request('/v1/departments', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code, name: `Verification ${suffix}` }) });
	if (created.status !== 201) throw new Error(`Create verification failed (${created.status}).`);
	const item = (await payload(created)).data;
	const updated = await request(`/v1/departments/${item.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code, name: `Verified ${suffix}` }) });
	if (updated.status !== 200) throw new Error(`Update verification failed (${updated.status}).`);
	const removed = await request(`/v1/departments/${item.id}`, { method: 'DELETE' });
	if (removed.status !== 200) throw new Error(`Delete verification failed (${removed.status}).`);
	await payload(removed);
	const removedAgain = await request(`/v1/departments/${item.id}`, { method: 'DELETE' });
	if (removedAgain.status !== 404) throw new Error(`Repeated delete verification failed (${removedAgain.status}).`);
	const listed = await request('/v1/departments?sortBy=code&sortOrder=DESC&offset=0&limit=10');
	const listedPayload = await payload(listed);
	if (listed.status !== 200 || listedPayload.data.some((entry) => entry.id === item.id) || listedPayload.meta.limit !== 10 || listedPayload.meta.sort.order !== 'desc') throw new Error('The list API contract verification failed.');
	const invalidLimit = await request('/v1/departments?limit=0');
	if (invalidLimit.status !== 422 || (await payload(invalidLimit)).error.code !== 'INVALID_LIMIT') throw new Error('The list limit guard verification failed.');
	const databaseResult = await client.query('SELECT deleted_at IS NOT NULL AS deleted FROM departments WHERE id = $1', [item.id]);
	if (databaseResult.rowCount !== 1 || !databaseResult.rows[0].deleted) throw new Error('The record was not retained as soft-deleted data.');

	const employmentTypeResponse = await request('/v1/employment-types', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: `TYPE_${suffix}`, name: `Employee type ${suffix}` }) });
	if (employmentTypeResponse.status !== 201) throw new Error(`Employment type verification failed (${employmentTypeResponse.status}).`);
	const employmentType = (await payload(employmentTypeResponse)).data;
	const employeeBranchResponse = await request('/v1/branches', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: `EBR_${suffix}`, name: `Employee branch ${suffix}`, notes: 'Employee API verification branch' }) });
	if (employeeBranchResponse.status !== 201) throw new Error(`Employee branch verification failed (${employeeBranchResponse.status}).`);
	const employeeBranch = (await payload(employeeBranchResponse)).data;
	const employeeCode = `EMP${suffix}`;
	const employeeInput = { employeeCode, firstName: 'API', lastName: 'Verification', birthDate: '1990-03-15', gender: 'unspecified', email: `${suffix.toLowerCase()}@example.test`, hiredAt: '2020-04-01', employmentTypeId: employmentType.id, branchId: employeeBranch.id, roleCodes: ['general_user'] };
	const missingRolesResponse = await request('/v1/employees', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...employeeInput, employeeCode: `NOROLE${suffix}`, roleCodes: [] }) });
	if (missingRolesResponse.status !== 400) throw new Error(`Required employee roles create guard failed (${missingRolesResponse.status}).`);
	await payload(missingRolesResponse);
	const duplicateRolesResponse = await request('/v1/employees', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...employeeInput, employeeCode: `DUPROLE${suffix}`, roleCodes: ['general_user', 'general_user'] }) });
	if (duplicateRolesResponse.status !== 400) throw new Error(`Duplicate employee roles guard failed (${duplicateRolesResponse.status}).`);
	await payload(duplicateRolesResponse);
	for (const field of ['birthDate', 'gender', 'email', 'hiredAt', 'employmentTypeId', 'branchId']) {
		const invalidInput = { ...employeeInput, employeeCode: `BAD${suffix}`, [field]: null };
		const invalidResponse = await request('/v1/employees', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(invalidInput) });
		if (invalidResponse.status !== 400) throw new Error(`Required employee ${field} create guard failed (${invalidResponse.status}).`);
		await payload(invalidResponse);
	}
	const employeeResponse = await request('/v1/employees', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...employeeInput, emergencyContactName: 'Removed', emergencyContactRelation: 'Removed', emergencyContactPhone: '+81 90 0000 0000' }) });
	if (employeeResponse.status !== 201) throw new Error(`Employee create verification failed (${employeeResponse.status}).`);
	const employee = (await payload(employeeResponse)).data;
	if (hasRemovedEmployeeFields(employee) || !hasEmployeeDerivedFields(employee) || employee.email !== employeeInput.email || employee.roles.length !== 1 || employee.roles[0].code !== 'general_user') throw new Error('Employee create response contract failed.');
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
		if (field === 'department') return entry.departmentRef?.name ?? '';
		if (field === 'group') return entry.group?.name ?? '';
		if (field === 'position') return entry.position?.name ?? '';
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
	const removedEmployee = await request(`/v1/employees/${employee.id}`, { method: 'DELETE' });
	if (removedEmployee.status !== 200) throw new Error(`Employee soft-delete verification failed (${removedEmployee.status}).`);
	const removedEmploymentType = await request(`/v1/employment-types/${employmentType.id}`, { method: 'DELETE' });
	if (removedEmploymentType.status !== 200) throw new Error(`Employment type soft-delete verification failed (${removedEmploymentType.status}).`);
	const removedEmployeeBranch = await request(`/v1/branches/${employeeBranch.id}`, { method: 'DELETE' });
	if (removedEmployeeBranch.status !== 200) throw new Error(`Employee branch soft-delete verification failed (${removedEmployeeBranch.status}).`);

	const branchResponse = await request('/v1/branches', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: `BR_${suffix}`, name: `Branch ${suffix}`, notes: 'Asset API verification branch' }) });
	if (branchResponse.status !== 201) throw new Error(`Branch verification failed (${branchResponse.status}).`);
	const branch = (await payload(branchResponse)).data;
	const roomResponse = await request('/v1/rooms', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: `ROOM_${suffix}`, name: `Room ${suffix}`, branchId: branch.id, notes: 'Asset API verification room' }) });
	if (roomResponse.status !== 201) throw new Error(`Room verification failed (${roomResponse.status}).`);
	const room = (await payload(roomResponse)).data;
	const locationResponse = await request('/v1/storage-locations', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: `LOC_${suffix}`, name: `Location ${suffix}`, roomId: room.id, notes: 'Asset API verification storage' }) });
	if (locationResponse.status !== 201) throw new Error(`Location verification failed (${locationResponse.status}).`);
	const location = (await payload(locationResponse)).data;
	const [typesResponse, statusesResponse] = await Promise.all([request('/v1/it-asset-types?limit=500'), request('/v1/it-asset-statuses?limit=500')]);
	const types = (await payload(typesResponse)).data;
	const statuses = (await payload(statusesResponse)).data;
	const type = types.find((entry) => entry.code === 'LAPTOP') ?? types[0];
	const displayType = types.find((entry) => entry.code === 'DISPLAY');
	const status = statuses.find((entry) => entry.code === 'NORMAL') ?? statuses[0];
	if (!type || !status || !displayType || displayType.managementCodePrefix !== 'DSP') throw new Error('IT asset reference masters are unavailable.');
	const verificationPrefix = 'T' + [...suffix.slice(0, 4)].map(value => String.fromCharCode(65 + parseInt(value, 16))).join('');
	const invalidType = await request('/v1/it-asset-types', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: `CODE_INVALID_${suffix}`, name: `Invalid prefix ${suffix}`, managementCodePrefix: 'AB' }) });
	if (invalidType.status !== 400) throw new Error('IT asset type prefix validation failed.');
	const codeTypeResponse = await request('/v1/it-asset-types', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: `CODE_VERIFY_${suffix}`, name: `Code verification ${suffix}`, managementCodePrefix: verificationPrefix }) });
	if (codeTypeResponse.status !== 201) throw new Error(`IT asset type creation failed (${codeTypeResponse.status}).`);
	const codeType = (await payload(codeTypeResponse)).data;
	await client.query('UPDATE it_asset_types SET next_management_number = 10000 WHERE id = $1', [codeType.id]);
	await expectItAssetError(await request(`/v1/it-asset-code-previews?typeId=${codeType.id}`), 409, 'IT_ASSET_CODE_EXHAUSTED', 'assetTag');
	await expectItAssetError(await request('/v1/it-assets', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ typeId: codeType.id, statusId: status.id, locationId: location.id, purchasedOn: '2026-09-01' }) }), 409, 'IT_ASSET_CODE_EXHAUSTED', 'assetTag');
	const removedCodeType = await request(`/v1/it-asset-types/${codeType.id}`, { method: 'DELETE' });
	if (removedCodeType.status !== 200) throw new Error(`IT asset type cleanup failed (${removedCodeType.status}).`);
	const manufacturerResponse = await request('/v1/manufacturers', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: `MAKE_${suffix}`, name: `Manufacturer ${suffix}` }) });
	if (manufacturerResponse.status !== 201) throw new Error(`Manufacturer verification failed (${manufacturerResponse.status}).`);
	const manufacturer = (await payload(manufacturerResponse)).data;
	const assetInput = { typeId: type.id, statusId: status.id, locationId: location.id, purchasedOn: '2026-09-01', manufacturerId: manufacturer.id, serialNumber: `SER_${suffix}` };
	await expectItAssetError(await request('/v1/it-assets', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...assetInput, purchasedOn: '' }) }), 400, 'VALIDATION_ERROR', 'purchasedOn');
	await expectItAssetError(await request('/v1/it-assets', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...assetInput, typeId: '' }) }), 400, 'VALIDATION_ERROR', 'typeId');
	await expectItAssetError(await request('/v1/it-assets', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...assetInput, locationId: 0 }) }), 400, 'VALIDATION_ERROR', 'locationId');
	await expectItAssetError(await request('/v1/it-assets', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...assetInput, locationId: 2147483647 }) }), 400, 'VALIDATION_ERROR', 'locationId');
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
	if (!new RegExp(`^${type.managementCodePrefix}-[0-9]{4}$`).test(preview)) throw new Error('IT asset code preview format failed.');
	const assetResponse = await request('/v1/it-assets', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(assetInput) });
	if (assetResponse.status !== 201) throw new Error(`IT asset verification failed (${assetResponse.status}).`);
	const asset = (await payload(assetResponse)).data;
	if (asset.assetTag !== preview) throw new Error('IT asset code allocation differs from the preview without concurrent writes.');
	await expectItAssetError(await request('/v1/it-assets', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(assetInput) }), 409, 'IT_ASSET_FIELD_CONFLICT', 'serialNumber');
	await expectItAssetError(await request(`/v1/it-assets/${asset.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...assetInput, statusId: 0 }) }), 400, 'VALIDATION_ERROR', 'statusId');
	const secondInput = { ...assetInput, serialNumber: `SECOND_SER_${suffix}` };
	const thirdInput = { ...assetInput, serialNumber: `THIRD_SER_${suffix}`, assigneeId: employeeId };
	const [secondResponse, thirdResponse] = await Promise.all([secondInput, thirdInput].map(input => request('/v1/it-assets', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) })));
	if (secondResponse.status !== 201 || thirdResponse.status !== 201) throw new Error('Concurrent IT asset creation failed.');
	const secondAsset = (await payload(secondResponse)).data;
	const thirdAsset = (await payload(thirdResponse)).data;
	if (thirdAsset.assignments[0]?.employee.id !== employeeId) throw new Error('IT asset creation and assignment were not atomic.');
	const createdHistory = await payload(await request(`/v1/it-assets/${thirdAsset.id}/history`));
	if (createdHistory.meta.total !== 1 || createdHistory.data[0]?.action !== 'create' ||
		!createdHistory.data[0].changes.some(change => change.field === 'assigneeId' && change.after)) throw new Error('Initial IT asset change history did not retain its assignee.');
	const brokenStatus = statuses.find((entry) => entry.code === 'BROKEN');
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
	for (const field of ['type', 'manufacturer', 'branch', 'room', 'storageLocation', 'user', 'status']) {
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
	const fieldHistory = await payload(await request(`/v1/it-assets/${secondAsset.id}/history`));
	if (!fieldHistory.data.some(entry => entry.changes.some(change => change.field === 'modelNumber' && change.after === 'Updated verification model'))) throw new Error('Model number change was not recorded.');
	const movedSecond = await request(`/v1/it-assets/${secondAsset.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...secondInput, typeId: displayType.id }) });
	if (movedSecond.status !== 200 || !new RegExp('^DSP-[0-9]{4}$').test((await payload(movedSecond)).data.assetTag)) throw new Error('Type-change management code allocation failed.');
	const fourthResponse = await request('/v1/it-assets', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...assetInput, serialNumber: `FOURTH_SER_${suffix}` }) });
	if (fourthResponse.status !== 201) throw new Error(`Fourth IT asset verification failed (${fourthResponse.status}).`);
	const fourthAsset = (await payload(fourthResponse)).data;
	if (Number(fourthAsset.assetTag.split('-')[1]) <= Math.max(Number(secondAsset.assetTag.split('-')[1]), Number(thirdAsset.assetTag.split('-')[1]))) throw new Error('Reassigned management code was reused.');
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
	await client.query('UPDATE employee_roles SET role_id = $1 WHERE id = $2', [roleByCode.general_user, roleGrantId]);
	const forbidden = await request('/v1/departments', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: `DENIED_${suffix}`, name: 'Denied' }) });
	if (forbidden.status !== 403 || (await payload(forbidden)).error.code !== 'ADMIN_REQUIRED') throw new Error('Employee role guard verification failed.');
	const generalEmployeeList = await request('/v1/employees?limit=1');
	if (generalEmployeeList.status !== 200 || (await payload(generalEmployeeList)).meta.total < 1) throw new Error('General user employee read verification failed.');
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
	const businessMaster = await request('/v1/departments', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: `BIZ_${suffix}`, name: `Business administrator ${suffix}` }) });
	if (businessMaster.status !== 201) throw new Error(`Business administrator master write verification failed (${businessMaster.status}).`);
	const businessItem = (await payload(businessMaster)).data;
	const removedBusinessMaster = await request(`/v1/departments/${businessItem.id}`, { method: 'DELETE' });
	if (removedBusinessMaster.status !== 200) throw new Error(`Business administrator master delete verification failed (${removedBusinessMaster.status}).`);
	await payload(removedBusinessMaster);
	await client.query('UPDATE employee_roles SET role_id = $1 WHERE id = $2', [originalRole, roleGrantId]);
	const referencedLocation = await request(`/v1/storage-locations/${location.id}`, { method: 'DELETE' });
	if (referencedLocation.status !== 409) throw new Error(`Reference guard verification failed (${referencedLocation.status}).`);
	const removedAsset = await request(`/v1/it-assets/${asset.id}`, { method: 'DELETE' });
	if (removedAsset.status !== 200) throw new Error(`IT asset soft-delete verification failed (${removedAsset.status}).`);
	const removedManufacturer = await request(`/v1/manufacturers/${manufacturer.id}`, { method: 'DELETE' });
	if (removedManufacturer.status !== 200) throw new Error(`Manufacturer soft-delete verification failed (${removedManufacturer.status}).`);
	const removedLocation = await request(`/v1/storage-locations/${location.id}`, { method: 'DELETE' });
	if (removedLocation.status !== 200) throw new Error(`Location soft-delete verification failed (${removedLocation.status}).`);
	const removedRoom = await request(`/v1/rooms/${room.id}`, { method: 'DELETE' });
	if (removedRoom.status !== 200) throw new Error(`Room soft-delete verification failed (${removedRoom.status}).`);
	const removedBranch = await request(`/v1/branches/${branch.id}`, { method: 'DELETE' });
	if (removedBranch.status !== 200) throw new Error(`Branch soft-delete verification failed (${removedBranch.status}).`);
	const retainedAssets = await client.query('SELECT (SELECT deleted_at IS NOT NULL FROM storage_locations WHERE id = $1) AND (SELECT deleted_at IS NOT NULL FROM rooms WHERE id = $2) AND (SELECT deleted_at IS NOT NULL FROM branches WHERE id = $3) AND (SELECT deleted_at IS NOT NULL FROM it_assets WHERE id = $4) AS deleted', [location.id, room.id, branch.id, asset.id]);
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
	console.log(JSON.stringify({ unauthenticated: 401, forbidden: 403, login: 200, create: 201, update: 200, delete: 200, repeatedDelete: 404, list: 200, invalidLimit: 422, employeeContract: true, referenceGuard: 409, itAssetAssignmentGuard: 409, relatedSoftDelete: true, logout: 200, softDeleteVerified: true }));
} finally {
	if (employeeId !== undefined && originalMustChange !== undefined && originalRole !== undefined && originalPasswordHash !== undefined) {
		await client.query('UPDATE employees SET must_change_credentials = $1, password_hash = $2 WHERE id = $3', [originalMustChange, originalPasswordHash, employeeId]).catch(() => undefined);
		await client.query('UPDATE employee_roles SET role_id = $1 WHERE id = $2', [originalRole, roleGrantId]).catch(() => undefined);
	}
	await client.end();
}
