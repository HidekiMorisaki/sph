import { randomUUID } from 'node:crypto';
import { Client } from 'pg';

const baseUrl = process.env.API_VERIFY_BASE_URL ?? 'http://localhost:3000';
const origin = process.env.API_VERIFY_ORIGIN ?? baseUrl;
const username = process.env.INITIAL_ADMIN_USERNAME;
const password = process.env.INITIAL_ADMIN_PASSWORD;
const verificationDatabaseName = process.env.API_VERIFY_DATABASE_NAME;
if (!username || !password || !process.env.DATABASE_URL) throw new Error('Calendar verification prerequisites are unavailable.');
if (!verificationDatabaseName || !/^[a-z][a-z0-9_]*_verify$/.test(verificationDatabaseName)) throw new Error('Calendar verification requires a dedicated database ending in _verify.');

const client = new Client({ connectionString: process.env.DATABASE_URL });
let cookie;
let employeeId;
let roleGrantId;
let originalRoleId;
let originalMustChange;

async function request(path, init = {}) {
	return fetch(baseUrl + path, { ...init, headers: { origin, ...(init.headers ?? {}), ...(cookie ? { cookie } : {}) } });
}

async function payload(response) {
	const body = await response.json();
	if (body.responseCode !== response.status || body.status !== (response.ok ? 'success' : 'error')) throw new Error(`Invalid API envelope (${response.status}).`);
	return body;
}

async function expect(response, status, label) {
	const body = await payload(response);
	if (response.status !== status) throw new Error(`${label} failed (${response.status}/${body.error?.code ?? 'UNKNOWN'}).`);
	return body;
}

try {
	await client.connect();
	const database = await client.query('SELECT current_database() AS name');
	if (database.rows[0]?.name !== verificationDatabaseName) throw new Error('Calendar verification database mismatch.');
	const account = await client.query(`SELECT e.id, e.must_change_credentials, er.id AS grant_id, er.role_id
		FROM employees e
		JOIN employee_roles er ON er.employee_id = e.id AND er.scope_type = 'global' AND er.deleted_at IS NULL
		JOIN roles r ON r.id = er.role_id AND r.code = 'system_administrator' AND r.deleted_at IS NULL
		WHERE e.username = $1 AND e.deleted_at IS NULL`, [username]);
	if (account.rowCount !== 1) throw new Error('Verification administrator is unavailable.');
	({ id: employeeId, must_change_credentials: originalMustChange, grant_id: roleGrantId, role_id: originalRoleId } = account.rows[0]);
	await client.query('UPDATE employees SET must_change_credentials = false WHERE id = $1', [employeeId]);

	await expect(await request('/v1/work-calendars'), 401, 'Unauthenticated calendar read guard');
	const loginResponse = await request('/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identifier: username, password }) });
	await expect(loginResponse, 200, 'Administrator login');
	cookie = loginResponse.headers.get('set-cookie')?.split(';')[0];
	if (!cookie) throw new Error('Login did not issue a session cookie.');

	const suffix = randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase();
	const calendarName = `Calendar ${suffix}`;
	const created = await expect(await request('/v1/work-calendars', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: calendarName, calendarYear: 2030, scheduledWorkMinutesPerDay: 465, description: 'Calendar verification' }) }), 201, 'Calendar create');
	const calendar = created.data;
	if (Object.hasOwn(calendar, 'code') || calendar.name !== calendarName || calendar.scheduledWorkMinutesPerDay !== 465) throw new Error('Calendar response does not contain the expected natural key and scheduled working time.');
	const duplicateCalendar = await expect(await request('/v1/work-calendars', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: calendarName, calendarYear: 2031, scheduledWorkMinutesPerDay: 465, description: null }) }), 409, 'Calendar name uniqueness guard');
	if (!duplicateCalendar.error.details?.some((detail) => detail.field === 'name')) throw new Error('Calendar name uniqueness error is not associated with name.');
	await expect(await request(`/v1/work-calendars/${calendar.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: `Updated ${suffix}`, calendarYear: 2030, scheduledWorkMinutesPerDay: 480, description: null }) }), 200, 'Calendar update');
	await expect(await request(`/v1/work-calendars/${calendar.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: `Updated ${suffix}`, calendarYear: 2031, scheduledWorkMinutesPerDay: 480, description: null }) }), 422, 'Calendar year immutability guard');
	const dayCreated = await expect(await request(`/v1/work-calendars/${calendar.id}/entries`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ workDate: '2030-04-01', entryType: 'working_day', title: 'Verification day', note: 'Entry note' }) }), 201, 'Calendar entry create');
	const day = dayCreated.data;
	await expect(await request(`/v1/work-calendars/${calendar.id}/entries`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ workDate: '2031-01-01', entryType: 'working_day', title: 'Outside year' }) }), 422, 'Calendar year range guard');
	await expect(await request(`/v1/work-calendars/${calendar.id}/entries`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ workDate: '2030-04-01', entryType: 'company_holiday', title: 'Duplicate' }) }), 409, 'Duplicate calendar entry guard');
	await expect(await request(`/v1/work-calendars/${calendar.id}/entries/${day.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ workDate: '2030-04-02', entryType: 'company_holiday', title: 'Updated holiday', note: null }) }), 200, 'Calendar entry update');
	const assignment = await expect(await request(`/v1/work-calendars/${calendar.id}/employees`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ employeeIds: [employeeId] }) }), 200, 'Employee assignment');
	if (!assignment.data.some((employee) => employee.id === employeeId)) throw new Error('Assigned employee was not returned.');
	await expect(await request('/v1/work-calendars?limit=0'), 422, 'Calendar list limit guard');
	await expect(await request(`/v1/work-calendars/${calendar.id}/entries?limit=500`), 200, 'Calendar entry read');
	await expect(await request(`/v1/work-calendars/${calendar.id}/employees?limit=500`), 200, 'Assignment read');
	const attributes = await expect(await request('/v1/calendar-date-attributes?from=2030-04-01&to=2030-04-30&limit=500'), 200, 'Calendar date attribute read');
	if (!attributes.data.some((attribute) => attribute.kind === 'saturday') || !attributes.data.some((attribute) => attribute.kind === 'sunday')) throw new Error('Stored weekend attributes were not returned.');
	await expect(await request('/v1/calendar-date-attributes?from=2010-12-01&to=2010-12-31'), 422, 'Calendar data start guard');

	const roles = Object.fromEntries((await client.query("SELECT id, code FROM roles WHERE code IN ('system_administrator', 'business_administrator', 'general_user')")).rows.map((role) => [role.code, role.id]));
	for (const role of ['general_user', 'business_administrator']) {
		await client.query('UPDATE employee_roles SET role_id = $1 WHERE id = $2', [roles[role], roleGrantId]);
		await expect(await request(`/v1/work-calendars/${calendar.id}`), 200, `${role} calendar read`);
		const denied = await expect(await request(`/v1/work-calendars/${calendar.id}/entries`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ workDate: '2030-05-01', entryType: 'working_day', title: 'Denied' }) }), 403, `${role} calendar write guard`);
		if (denied.error.code !== 'SYSTEM_ADMIN_REQUIRED') throw new Error(`${role} returned the wrong authorization error.`);
	}

	await client.query('UPDATE employee_roles SET role_id = $1 WHERE id = $2', [originalRoleId, roleGrantId]);
	await expect(await request(`/v1/work-calendars/${calendar.id}`, { method: 'DELETE' }), 200, 'Calendar delete');
	const retained = await client.query('SELECT (SELECT deleted_at IS NOT NULL FROM work_calendars WHERE id = $1) AS calendar_deleted, (SELECT deleted_at IS NOT NULL FROM work_calendar_days WHERE id = $2) AS day_deleted, (SELECT work_calendar_id IS NULL FROM employees WHERE id = $3) AS assignment_cleared', [calendar.id, day.id, employeeId]);
	if (!retained.rows[0]?.calendar_deleted || !retained.rows[0]?.day_deleted || !retained.rows[0]?.assignment_cleared) throw new Error('Calendar soft deletion or assignment cleanup failed.');
	console.log(JSON.stringify({ unauthenticated: 401, systemAdministratorCrud: true, generalUserReadOnly: true, businessAdministratorReadOnly: true, softDeleteVerified: true }));
} finally {
	if (employeeId !== undefined && originalMustChange !== undefined) await client.query('UPDATE employees SET must_change_credentials = $1 WHERE id = $2', [originalMustChange, employeeId]).catch(() => undefined);
	if (roleGrantId !== undefined && originalRoleId !== undefined) await client.query('UPDATE employee_roles SET role_id = $1 WHERE id = $2', [originalRoleId, roleGrantId]).catch(() => undefined);
	await client.end();
}
