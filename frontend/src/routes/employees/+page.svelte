<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { apiData } from '$lib/api';
	import AssetManagementShell from '$lib/components/AssetManagementShell.svelte';
	import DatePicker from '$lib/components/DatePicker.svelte';
	import MasterList from '$lib/components/MasterList.svelte';
	import SearchSelect from '$lib/components/SearchSelect.svelte';
	import { en as messages } from '$lib/ui/messages';

	type Master = { id: number; code: string; name: string };
	type Role = { code: string; name: string };
	type Employee = {
		id: number; employeeCode: string; firstName: string; middleName: string | null; lastName: string; nameKana: string | null;
		birthDate: string; age: number; lengthOfService: { years: number; months: number }; gender: string; bloodType: string | null; postalCode: string | null; prefecture: string | null;
		city: string | null; streetAddress: string | null; buildingName: string | null; mobilePhone: string | null; email: string;
		hiredAt: string; departmentId: number | null; groupId: number | null; positionId: number | null;
		employmentTypeId: number; branchId: number; retiredAt: string | null; notes: string | null;
		createdAt: string; updatedAt: string; deletedAt: string | null; departmentRef?: Master | null; group?: Master | null;
		position?: Master | null; employmentType?: Master | null; branch?: Master | null; roles: Role[]; canIssueInvitation: boolean;
	};
	type InvitationPayload = { invitationUrl: string; invitationExpiresAt: string };
	type ExportColumn = { key: string; columnName: string; comment: string | null };
	type ListMeta = { offset: number; limit: number; returned: number; total: number; hasMore: boolean; search: string; calculatedAsOf: string; sort: { field: string; order: 'asc' | 'desc' }; columns?: ExportColumn[] };
	type ApiListPayload = { status: 'success'; responseCode: number; data: Employee[]; meta: ListMeta };
	type DateField = 'birthDate' | 'hiredAt' | 'retiredAt';
	type SelectField = 'gender' | 'bloodType' | 'departmentId' | 'groupId' | 'positionId' | 'employmentTypeId' | 'branchId';
	type SelectOption = { value: string; label: string; searchTerms?: string[] };
	type ApiErrorDetail = { field?: string; reason: string };
	type ApiErrorPayload = { error?: { code?: string; message?: string; details?: ApiErrorDetail[] } };

	const resources = ['departments', 'employee-groups', 'positions', 'employment-types', 'branches'];
	const genders = [['female', 'Female'], ['male', 'Male'], ['unspecified', 'Unspecified']] as const;
	const bloodTypes = ['A', 'B', 'AB', 'O'];
	const requiredPickerFields = ['birthDate', 'gender', 'hiredAt', 'employmentTypeId', 'branchId'] as const;
	const blank = () => ({
		employeeCode: '', firstName: '', middleName: '', lastName: '', nameKana: '', birthDate: '', gender: '', bloodType: '',
		postalCode: '', prefecture: '', city: '', streetAddress: '', buildingName: '', mobilePhone: '', email: '',
		hiredAt: '', departmentId: '', groupId: '', positionId: '', employmentTypeId: '', branchId: '', retiredAt: '', notes: '', roleCodes: [] as string[]
	});

	let employeeList = $state<MasterList>();
	let form = $state(blank());
	let editing = $state<Employee | null>(null);
	let detailEmployee = $state<Employee | null>(null);
	let formOpen = $state(false);
	let detailOpen = $state(false);
	let invitation = $state<{ url: string; email: string; expiresAt: string } | null>(null);
	let invitationDialogElement = $state<HTMLDialogElement>();
	let invitationError = $state('');
	let issuingInvitation = $state(false);
	let copyMessage = $state('');
	let message = $state('');
	let missingFields = $state<string[]>([]);
	let fieldErrors = $state<Record<string, string>>({});
	let formError = $state('');
	let saving = $state(false);
	let masters = $state<Record<string, Master[]>>({});
	let roles = $state<Role[]>([]);
	let currentUserRoles = $state<string[]>([]);
	let canManageEmployees = $derived(currentUserRoles.includes('system_administrator') || currentUserRoles.includes('business_administrator'));
	let activeDateField = $state<DateField | null>(null);
	let exporting = $state(false);

	const iso = (value: string | null) => value ? value.slice(0, 10) : '';
	const dateIso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
	const display = (value: string | number | null | undefined) => value === null || value === undefined || value === '' ? '' : String(value);
	const formatDate = (value: string | null) => value ? value.slice(0, 10) : '';
	const formatTimestampDate = (value: string | null) => value ? dateIso(new Date(value)) : '';
	const fullName = (item: Employee) => [item.firstName, item.middleName, item.lastName].filter(Boolean).join(' ');
	const initials = (item: Employee) => `${item.firstName.charAt(0)}${item.lastName.charAt(0)}`.toUpperCase();
	const formatLengthOfService = (value: Employee['lengthOfService']) => `${value.years} ${value.years === 1 ? messages.employee.year : messages.employee.years} ${value.months} ${value.months === 1 ? messages.employee.month : messages.employee.months}`;
	const fieldError = (field: string) => fieldErrors[field] ?? (missingFields.includes(field) ? (field === 'roleCodes' ? 'Select at least one role.' : 'This field is required.') : '');
	function clearFieldError(field: string) {
		if (fieldErrors[field]) { const next = { ...fieldErrors }; delete next[field]; fieldErrors = next; }
		missingFields = missingFields.filter((name) => name !== field);
		if (!Object.keys(fieldErrors).length && !missingFields.length) formError = '';
	}
	function updateTextField(field: Exclude<keyof ReturnType<typeof blank>, 'roleCodes'>, value: string) { form[field] = value; clearFieldError(field); }

	function chooseDate(field: DateField, value: string) { form[field] = value; clearFieldError(field); activeDateField = null; }
	async function loadMasters() {
		const responses = await Promise.all(resources.map((resource) => fetch(`/v1/${resource}?limit=500`)));
		masters = Object.fromEntries(await Promise.all(responses.map(async (response, index) => [resources[index], response.ok ? await apiData<Master[]>(response) : []])));
	}
	async function loadRoleOptions() {
		const [roleResponse, sessionResponse] = await Promise.all([fetch('/v1/roles?sortBy=name&sortOrder=asc&limit=100'), fetch('/v1/auth/session')]);
		if (roleResponse.ok) roles = await apiData<Role[]>(roleResponse);
		if (sessionResponse.ok) currentUserRoles = (await apiData<{ user: { roles: string[] } }>(sessionResponse)).user.roles;
	}
	function focusEmployeeForm() { void tick().then(() => { if (formOpen) document.querySelector<HTMLInputElement>('.employee-form [name="employeeCode"]')?.focus(); }); }
	function resetFormErrors() { missingFields = []; fieldErrors = {}; formError = ''; }
	function create() { if (!canManageEmployees) return; editing = null; form = blank(); resetFormErrors(); activeDateField = null; formOpen = true; focusEmployeeForm(); }
	function edit(item: Employee) {
		if (!canManageEmployees) return;
		editing = item;
		form = {
			employeeCode: item.employeeCode, firstName: item.firstName, middleName: item.middleName ?? '', lastName: item.lastName,
			nameKana: item.nameKana ?? '', birthDate: iso(item.birthDate), gender: item.gender ?? '', bloodType: item.bloodType ?? '',
			postalCode: item.postalCode ?? '', prefecture: item.prefecture ?? '', city: item.city ?? '', streetAddress: item.streetAddress ?? '',
			buildingName: item.buildingName ?? '', mobilePhone: item.mobilePhone ?? '', email: item.email ?? '',
			hiredAt: iso(item.hiredAt), departmentId: item.departmentId === null ? '' : String(item.departmentId), groupId: item.groupId === null ? '' : String(item.groupId),
			positionId: item.positionId === null ? '' : String(item.positionId), employmentTypeId: item.employmentTypeId === null ? '' : String(item.employmentTypeId),
			branchId: item.branchId === null ? '' : String(item.branchId), retiredAt: iso(item.retiredAt), notes: item.notes ?? '', roleCodes: item.roles.map((role) => role.code)
		};
		resetFormErrors(); activeDateField = null; formOpen = true; focusEmployeeForm();
	}
	function roleIsLocked(roleCode: string) { return roleCode === 'system_administrator' && !currentUserRoles.includes('system_administrator'); }
	function toggleRole(roleCode: string) {
		if (roleIsLocked(roleCode)) return;
		form.roleCodes = form.roleCodes.includes(roleCode) ? form.roleCodes.filter((code) => code !== roleCode) : [...form.roleCodes, roleCode];
		clearFieldError('roleCodes');
	}
	function showDetail(item: Employee) { detailEmployee = item; detailOpen = true; }
	function showInvitation(payload: InvitationPayload, email: string) {
		const url = new URL(payload.invitationUrl, window.location.origin);
		if (url.origin !== window.location.origin || url.pathname !== '/account-setup') throw new Error('Invalid invitation URL.');
		invitation = { url: url.href, email, expiresAt: payload.invitationExpiresAt };
		copyMessage = '';
		detailOpen = false;
		void tick().then(() => invitationDialogElement?.querySelector<HTMLInputElement>('input')?.focus());
	}
	function closeInvitation() { invitation = null; void tick().then(() => document.querySelector<HTMLButtonElement>('.app-add-button')?.focus()); }
	async function issueInvitation(item: Employee) {
		issuingInvitation = true;
		invitationError = '';
		try {
			const response = await fetch(`/v1/employees/${item.id}/invitations`, { method: 'POST' });
			if (!response.ok) {
				invitationError = response.status === 429 ? 'Too many invitations have been generated. Try again later.' : 'Unable to generate an invitation link.';
				return;
			}
			showInvitation(await apiData<InvitationPayload>(response), item.email);
		} catch { invitationError = 'Unable to generate an invitation link.'; }
		finally { issuingInvitation = false; }
	}
	async function copyInvitation() {
		if (!invitation) return;
		try { await navigator.clipboard.writeText(invitation.url); copyMessage = 'Link copied.'; }
		catch { copyMessage = 'Copy failed. Select and copy the link manually.'; }
	}
	async function save() {
		formError = ''; fieldErrors = {};
		missingFields = [...requiredPickerFields.filter((field) => !form[field]), ...(form.roleCodes.length ? [] : ['roleCodes'])];
		if (missingFields.length) {
			const field = missingFields[0];
			const selector = field === 'roleCodes' ? '.roles-field input:not(:disabled)' : field === 'birthDate' || field === 'hiredAt' ? `.custom-date[data-field="${field}"] .date-trigger` : `.form-select-picker[data-field="${field}"] .form-select-trigger`;
			document.querySelector<HTMLButtonElement>(selector)?.focus();
			return;
		}
		saving = true;
		try {
			const response = await fetch(editing ? `/v1/employees/${editing.id}` : '/v1/employees', { method: editing ? 'PATCH' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(form) });
			if (!response.ok) {
				const body = await response.json().catch(() => null) as ApiErrorPayload | null;
				const details = body?.error?.details ?? [];
				fieldErrors = Object.fromEntries(details.flatMap((detail) => detail.field ? [[detail.field, detail.reason]] : []));
				formError = body?.error?.code === 'ROLE_ASSIGNMENT_FORBIDDEN' ? 'You cannot assign or remove the System Administrator role.' : body?.error?.code === 'LAST_SYSTEM_ADMINISTRATOR' ? 'The last System Administrator role cannot be removed.' : body?.error?.message ?? 'Unable to save the employee.';
				const firstField = details.find((detail) => detail.field)?.field;
				if (firstField) void tick().then(() => focusFormField(firstField));
				return;
			}
			const saved = await apiData<Employee & Partial<InvitationPayload>>(response);
			formOpen = false; message = editing ? 'Employee updated.' : 'Employee created.';
			if (!editing && saved.invitationUrl && saved.invitationExpiresAt) showInvitation({ invitationUrl: saved.invitationUrl, invitationExpiresAt: saved.invitationExpiresAt }, saved.email);
			await employeeList?.refresh();
		} catch {
			formError = 'Unable to save the employee. Check your connection and try again.';
		} finally { saving = false; }
	}
	function focusFormField(field: string) {
		const selector = field === 'roleCodes' ? '.roles-field input:not(:disabled)' : field === 'birthDate' || field === 'hiredAt' || field === 'retiredAt' ? `.custom-date[data-field="${field}"] .date-trigger` : ['gender', 'bloodType', 'departmentId', 'groupId', 'positionId', 'employmentTypeId', 'branchId'].includes(field) ? `.form-select-picker[data-field="${field}"] .form-select-trigger` : `[name="${field}"]`;
		document.querySelector<HTMLElement>(selector)?.focus();
	}
	async function remove(item: Employee) {
		if (!canManageEmployees) return;
		if (!confirm(`Delete ${fullName(item)}?`)) return;
		const response = await fetch(`/v1/employees/${item.id}`, { method: 'DELETE' });
		if (!response.ok) { message = 'Unable to delete the employee.'; return; }
		message = 'Employee deleted.'; await employeeList?.refresh();
	}
	function windowKeydown(event: KeyboardEvent) {
		if (event.defaultPrevented) return;
		if (event.key !== 'Escape') return;
		if (invitation) closeInvitation();
		else if (activeDateField) { const field = activeDateField; activeDateField = null; void tick().then(() => document.querySelector<HTMLButtonElement>(`.custom-date[data-field="${field}"] .date-trigger`)?.focus()); }
		else if (detailOpen) detailOpen = false; else if (formOpen) formOpen = false;
	}
	function csvCell(value: unknown) {
		let text = value === null || value === undefined ? '' : String(value);
		if (/^[=+\-@]/.test(text)) text = `'${text}`;
		return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
	}
	async function exportCsv() {
		if (!canManageEmployees) return;
		exporting = true; message = '';
		try {
			const rows: Employee[] = []; let columns: ExportColumn[] = []; let offset = 0; let exportTotal = 0;
			do {
				const params = new URLSearchParams({ offset: String(offset), limit: '500', sortBy: 'employeeCode', sortOrder: 'asc' });
				if (offset === 0) params.set('includeColumns', 'true');
				const response = await fetch(`/v1/employees?${params}`); if (!response.ok) throw new Error('export request failed');
				const payload = await response.json() as ApiListPayload;
				rows.push(...payload.data); exportTotal = payload.meta.total; if (payload.meta.columns) columns = payload.meta.columns; offset += payload.data.length;
				if (payload.data.length === 0) break;
			} while (offset < exportTotal);
			if (columns.length === 0) throw new Error('column metadata unavailable');
			const csvRows = [columns.map((column) => csvCell(column.comment?.trim() || column.columnName)).join(',')];
			for (const row of rows) csvRows.push(columns.map((column) => csvCell((row as unknown as Record<string, unknown>)[column.key])).join(','));
			const blob = new Blob(['\uFEFF', csvRows.join('\r\n')], { type: 'text/csv;charset=utf-8' }); const url = URL.createObjectURL(blob);
			const anchor = document.createElement('a'); anchor.href = url; anchor.download = `employees-${dateIso(new Date())}.csv`; document.body.appendChild(anchor); anchor.click(); anchor.remove();
			window.setTimeout(() => URL.revokeObjectURL(url), 0); message = `Exported ${rows.length} employees.`;
		} catch { message = 'Unable to export employees.'; } finally { exporting = false; }
	}
	onMount(() => {
		void Promise.all([loadMasters(), loadRoleOptions()]);
	});
</script>

<svelte:window onkeydown={windowKeydown} />

{#snippet dateInput(label: string, field: DateField, value: string, above = false, required = false)}
	<DatePicker {label} {field} {value} {above} {required} error={fieldError(field)} open={activeDateField === field} onToggle={() => activeDateField = activeDateField === field ? null : field} onSelect={(selected) => chooseDate(field, selected)} />
{/snippet}
{#snippet formSelect(label: string, field: SelectField, options: SelectOption[], required = false)}
	<SearchSelect {label} {field} value={form[field]} {options} {required} error={fieldError(field)} onOpen={() => activeDateField = null} onSelect={(value) => { form[field] = value; clearFieldError(field); }} />
{/snippet}
{#snippet textInput(label: string, field: Exclude<keyof ReturnType<typeof blank>, 'roleCodes'>, placeholder: string, maximum: number, required = false, type = 'text', pattern: string | undefined = undefined, minimum: number | undefined = undefined)}
	<label><span>{label}{#if required} <span class="required" aria-hidden="true">*</span>{/if}</span><input name={field} value={form[field]} {required} {type} maxlength={maximum} minlength={minimum} {pattern} class:invalid={Boolean(fieldError(field))} aria-describedby={fieldError(field) ? `${field}-error` : undefined} aria-invalid={Boolean(fieldError(field))} {placeholder} oninput={(event) => updateTextField(field, event.currentTarget.value)} />{#if fieldError(field)}<span id={`${field}-error`} class="field-error" role="alert">{fieldError(field)}</span>{/if}</label>
{/snippet}
{#snippet employeeCell(item: Employee)}<div class="employee-cell"><span class="avatar">{initials(item)}</span><div><strong>{fullName(item)}</strong><small>{item.employeeCode}</small></div></div>{/snippet}
{#snippet rolesCell(item: Employee)}<div class="role-badges">{#each item.roles as role}<span>{role.name}</span>{/each}</div>{/snippet}
{#snippet exportAction()}<button class="export-button" type="button" disabled={exporting || !canManageEmployees} onclick={() => void exportCsv()}>{exporting ? 'Exporting…' : 'Export CSV'}</button>{/snippet}

<AssetManagementShell title="Employees" active="Employees">
	<div class="employees-page">
	<div class="heading"><div><p>PEOPLE DIRECTORY</p><h1>Employees</h1></div><button class="app-add-button" type="button" disabled={!canManageEmployees} onclick={create}><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M4 8h8M8 4v8" /></svg>Add employee</button></div>
	{#if message}<p class="notice">{message}</p>{/if}
	<MasterList bind:this={employeeList} endpoint="/v1/employees" title="Employees" listHeading="All employees" description="Sortable, searchable, paginated." initialSortBy="employee" pageSizeStorageKey="employees-page-size" minTableWidth={1120} edgePagination canManage={canManageEmployees} canDetail={true} canEdit={canManageEmployees} canDelete={canManageEmployees} actionLabel={(item) => fullName(item as Employee)} headerActions={exportAction} loadingLabel="Loading employees…" emptyLabel="No matches found" columns={[
		{ key: 'employee', label: 'Employee', width: 18, cell: employeeCell },
		{ key: 'age', label: messages.employee.age, width: 6, value: (item) => (item as Employee).age },
		{ key: 'lengthOfService', label: messages.employee.lengthOfService, width: 12, value: (item) => formatLengthOfService((item as Employee).lengthOfService) },
		{ key: 'department', label: 'Department', width: 10, value: (item) => (item as Employee).departmentRef?.name },
		{ key: 'group', label: 'Group', width: 9, value: (item) => (item as Employee).group?.name },
		{ key: 'position', label: 'Position', width: 9, value: (item) => (item as Employee).position?.name },
		{ key: 'employmentType', label: 'Employment type', width: 11, value: (item) => (item as Employee).employmentType?.name },
		{ key: 'branch', label: 'Branch', width: 9, value: (item) => (item as Employee).branch?.name },
		{ key: 'roles', label: 'Roles', width: 11, cell: rolesCell }
	]} onDetail={(item) => showDetail(item as Employee)} onEdit={(item) => edit(item as Employee)} onDelete={(item) => remove(item as Employee)} />
	</div>

	{#if formOpen}<div class="backdrop app-modal-backdrop" role="presentation"><dialog class="employee-dialog app-modal" open aria-modal="true" aria-labelledby="employee-form-title"><header><h2 id="employee-form-title">{editing ? 'Edit employee' : 'Add employee'}</h2><button class="modal-close app-modal-close" type="button" aria-label="Close employee form" onclick={() => formOpen = false}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg></button></header><form class="employee-form app-modal-form" onsubmit={(event) => { event.preventDefault(); void save(); }}><div class="employee-form-body app-modal-form-body">
		{#if formError}<div class="form-error-summary app-modal-error-summary wide" role="alert"><strong>Unable to save employee</strong><span>{formError}</span></div>{/if}
		<h3>Basic information</h3>{@render textInput('Employee code', 'employeeCode', 'e.g. JPDEMO00000001', 64, true, 'text', '[A-Za-z0-9]{10,64}', 10)}{@render textInput('First name', 'firstName', 'e.g. Hana', 128, true)}{@render textInput('Middle name', 'middleName', 'e.g. Marie', 128)}{@render textInput('Last name', 'lastName', 'e.g. Yamada', 128, true)}{@render textInput('Name (Kana)', 'nameKana', 'e.g. ヤマダ ハナ', 255)}{@render dateInput('Birth date', 'birthDate', form.birthDate, false, true)}{@render formSelect('Gender', 'gender', [{ value: '', label: '-' }, ...genders.map(([value, label]) => ({ value, label }))], true)}{@render formSelect('Blood type', 'bloodType', [{ value: '', label: '-' }, ...bloodTypes.map((type) => ({ value: type, label: type }))])}
		<h3>Contact information</h3>{@render textInput('Postal code', 'postalCode', 'e.g. 100-0001', 8, false, 'text', '\\d{3}-?\\d{4}')}{@render textInput('Prefecture', 'prefecture', 'e.g. Tokyo', 64)}{@render textInput('City', 'city', 'e.g. Chiyoda', 128)}{@render textInput('Street address', 'streetAddress', 'e.g. Chiyoda 1-1', 255)}{@render textInput('Building', 'buildingName', 'e.g. Main Building 3F', 255)}{@render textInput('Mobile phone', 'mobilePhone', 'e.g. 090-1234-5678', 32, false, 'tel', '[+0-9][0-9 ()-]{6,31}')}{@render textInput('Email', 'email', 'e.g. hana@example.com', 254, true, 'email')}
		<h3>Employment</h3>{@render dateInput('Hire date', 'hiredAt', form.hiredAt, false, true)}{@render formSelect('Department', 'departmentId', [{ value: '', label: '-' }, ...(masters.departments ?? []).map((item) => ({ value: String(item.id), label: item.name }))])}{@render formSelect('Group', 'groupId', [{ value: '', label: '-' }, ...(masters['employee-groups'] ?? []).map((item) => ({ value: String(item.id), label: item.name }))])}{@render formSelect('Position', 'positionId', [{ value: '', label: '-' }, ...(masters.positions ?? []).map((item) => ({ value: String(item.id), label: item.name }))])}{@render formSelect('Employment type', 'employmentTypeId', [{ value: '', label: '-' }, ...(masters['employment-types'] ?? []).map((item) => ({ value: String(item.id), label: item.name }))], true)}{@render formSelect('Branch', 'branchId', [{ value: '', label: '-' }, ...(masters.branches ?? []).map((item) => ({ value: String(item.id), label: item.name }))], true)}{@render dateInput('Retirement date', 'retiredAt', form.retiredAt, true)}<label class="wide">Notes<textarea name="notes" value={form.notes} maxlength="5000" class:invalid={Boolean(fieldError('notes'))} aria-describedby={fieldError('notes') ? 'notes-error' : undefined} aria-invalid={Boolean(fieldError('notes'))} placeholder="e.g. Notes about this employee" oninput={(event) => updateTextField('notes', event.currentTarget.value)}></textarea>{#if fieldError('notes')}<span id="notes-error" class="field-error" role="alert">{fieldError('notes')}</span>{/if}</label>
		<h3>Access</h3><fieldset class="roles-field wide" class:invalid={Boolean(fieldError('roleCodes'))}><legend>Roles <span class="required" aria-hidden="true">*</span></legend><div class="role-options">{#each roles as role}<label class:locked={roleIsLocked(role.code)}><input type="checkbox" checked={form.roleCodes.includes(role.code)} disabled={roleIsLocked(role.code)} onchange={() => toggleRole(role.code)} /><span>{role.name}</span></label>{/each}</div>{#if fieldError('roleCodes')}<span class="field-error" role="alert">{fieldError('roleCodes')}</span>{/if}{#if !currentUserRoles.includes('system_administrator')}<small>Only a System Administrator can change the System Administrator role.</small>{/if}</fieldset></div><footer class="employee-form-footer app-modal-footer"><button class="secondary" type="button" disabled={saving} onclick={() => formOpen = false}>Cancel</button><button class="primary save-button" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save employee'}</button></footer>
	</form></dialog></div>{/if}

	{#if detailOpen && detailEmployee}<div class="backdrop app-modal-backdrop" role="presentation"><dialog class="employee-dialog app-modal" open aria-modal="true" aria-labelledby="employee-detail-title"><header><div><p class="dialog-pretitle">{detailEmployee.employeeCode}</p><h2 id="employee-detail-title">Employee detail</h2></div><button class="modal-close app-modal-close" type="button" aria-label="Close employee detail" onclick={() => detailOpen = false}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg></button></header><div class="detail-body">
		<section><h3>Basic information</h3><dl class="detail-grid"><div><dt>Employee code</dt><dd>{detailEmployee.employeeCode}</dd></div><div><dt>First name</dt><dd>{detailEmployee.firstName}</dd></div><div><dt>Middle name</dt><dd>{display(detailEmployee.middleName)}</dd></div><div><dt>Last name</dt><dd>{detailEmployee.lastName}</dd></div><div><dt>Name (Kana)</dt><dd>{display(detailEmployee.nameKana)}</dd></div><div><dt>Birth date</dt><dd>{formatDate(detailEmployee.birthDate)}</dd></div><div><dt>{messages.employee.age}</dt><dd>{detailEmployee.age}</dd></div><div><dt>{messages.employee.lengthOfService}</dt><dd>{formatLengthOfService(detailEmployee.lengthOfService)}</dd></div><div><dt>Gender</dt><dd>{display(detailEmployee.gender)}</dd></div><div><dt>Blood type</dt><dd>{display(detailEmployee.bloodType)}</dd></div></dl></section>
		<section><h3>Contact information</h3><dl class="detail-grid"><div><dt>Postal code</dt><dd>{display(detailEmployee.postalCode)}</dd></div><div><dt>Prefecture</dt><dd>{display(detailEmployee.prefecture)}</dd></div><div><dt>City</dt><dd>{display(detailEmployee.city)}</dd></div><div><dt>Street address</dt><dd>{display(detailEmployee.streetAddress)}</dd></div><div><dt>Building</dt><dd>{display(detailEmployee.buildingName)}</dd></div><div><dt>Mobile phone</dt><dd>{display(detailEmployee.mobilePhone)}</dd></div><div><dt>Email</dt><dd>{display(detailEmployee.email)}</dd></div></dl></section>
		<section><h3>Employment</h3><dl class="detail-grid"><div><dt>Hire date</dt><dd>{formatDate(detailEmployee.hiredAt)}</dd></div><div><dt>Retirement date</dt><dd>{formatDate(detailEmployee.retiredAt)}</dd></div><div><dt>Department</dt><dd>{display(detailEmployee.departmentRef?.name)}</dd></div><div><dt>Group</dt><dd>{display(detailEmployee.group?.name)}</dd></div><div><dt>Position</dt><dd>{display(detailEmployee.position?.name)}</dd></div><div><dt>Employment type</dt><dd>{display(detailEmployee.employmentType?.name)}</dd></div><div><dt>Branch</dt><dd>{display(detailEmployee.branch?.name)}</dd></div><div class="wide"><dt>Notes</dt><dd class="notes-value">{display(detailEmployee.notes)}</dd></div></dl></section>
		<section><h3>System information</h3><dl class="detail-grid"><div><dt>Roles</dt><dd><span class="role-badges">{#each detailEmployee.roles as role}<span>{role.name}</span>{/each}</span></dd></div><div><dt>Created at</dt><dd>{formatTimestampDate(detailEmployee.createdAt)}</dd></div><div><dt>Updated at</dt><dd>{formatTimestampDate(detailEmployee.updatedAt)}</dd></div><div><dt>Deleted at</dt><dd>{formatTimestampDate(detailEmployee.deletedAt)}</dd></div></dl></section>
	</div>{#if currentUserRoles.includes('system_administrator') && detailEmployee.canIssueInvitation}<footer class="employee-form-footer app-modal-footer"><div class="invite-footer">{#if invitationError}<span role="alert">{invitationError}</span>{/if}<button class="primary" type="button" disabled={issuingInvitation} onclick={() => void issueInvitation(detailEmployee!)}>{issuingInvitation ? 'Generating…' : 'Generate invitation link'}</button></div></footer>{/if}</dialog></div>{/if}
	{#if invitation}<div class="backdrop app-modal-backdrop" role="presentation"><dialog bind:this={invitationDialogElement} class="employee-dialog invitation-dialog app-modal app-modal--invitation" open aria-modal="true" aria-labelledby="invitation-title"><header><h2 id="invitation-title">Employee invitation link</h2><button class="modal-close app-modal-close" type="button" aria-label="Close invitation" onclick={closeInvitation}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg></button></header><div class="invitation-body"><p>Send this link to <strong>{invitation.email}</strong> yourself. It is shown only now and expires at {new Date(invitation.expiresAt).toLocaleString()}.</p><label>Invitation URL<input aria-label="Invitation URL" readonly value={invitation.url} onclick={(event) => event.currentTarget.select()} /></label><p class="invitation-warning">Anyone with this link can set the account password until it expires. Share it only with the intended employee.</p>{#if copyMessage}<p role="status">{copyMessage}</p>{/if}</div><footer class="employee-form-footer app-modal-footer"><button class="secondary" type="button" onclick={closeInvitation}>Close</button><button class="primary" type="button" onclick={() => void copyInvitation()}>Copy link</button></footer></dialog></div>{/if}
</AssetManagementShell>

<style>
	.employee-cell>div{min-width:0}
	.role-badges{display:flex;flex-wrap:wrap;gap:4px}.role-badges>span{display:inline-flex;align-items:center;min-height:20px;padding:2px 7px;background:rgba(26,187,156,.12);color:#169f85;border:1px solid rgba(26,187,156,.28);border-radius:999px;font-size:10px;font-weight:600;line-height:1.2}
	.employees-page{display:flex;height:calc(100dvh - 124px);min-height:0;flex-direction:column}.heading{display:flex;flex:none;align-items:flex-start;justify-content:space-between;margin-bottom:24px}.heading p,.dialog-pretitle{margin:0;color:#1abb9c;font-size:11px;font-weight:700}.heading h1{margin:4px 0;font-size:30px}.primary,.secondary,.export-button{display:inline-flex;align-items:center;justify-content:center;height:32px;padding:0 12px;border:1px solid var(--border);border-radius:4px;font-size:12.5px;font-weight:500;line-height:1}.primary{background:#1abb9c!important;border-color:#169f85;color:#fff!important}.secondary,.export-button{background:var(--surface)!important;color:var(--text-secondary)!important}.export-button{box-shadow:var(--shadow);transition:background 120ms,border-color 120ms,color 120ms,box-shadow 120ms;white-space:nowrap}.export-button:hover{background:var(--surface-secondary)!important;color:var(--text)!important}.export-button:disabled{cursor:wait;opacity:.6}.export-button:focus{outline:none}.export-button:focus-visible{outline:2px solid #1abb9c;outline-offset:2px}.notice{flex:none;margin:0 0 14px;color:#169f85}.employee-cell{display:flex;align-items:center;gap:8px}.avatar{display:grid;flex:0 0 24px;height:24px;place-items:center;background:#1abb9c;color:#fff;border-radius:50%;font-size:9px;font-weight:600}.employee-cell strong{display:block;color:var(--text);font-weight:500}.employee-cell small{display:block;color:var(--muted);font-size:11px}.dialog-pretitle{margin-bottom:3px}.wide{grid-column:1/-1}.detail-body{flex:1;min-height:0;overflow-y:auto;padding:8px 24px 28px;background:var(--bg)}.detail-body section{margin-top:16px;padding:18px;background:var(--surface);border:1px solid var(--border);border-radius:6px}.detail-body h3{margin:0 0 14px;font-size:14px}.detail-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px 24px;margin:0}.detail-grid div{min-width:0}.detail-grid dt{margin-bottom:3px;color:var(--muted);font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.3px}.detail-grid dd{margin:0;overflow-wrap:anywhere;color:var(--text-secondary);font-size:13px}.notes-value{white-space:pre-wrap}@media(max-width:700px){.heading{align-items:stretch;flex-direction:column}.export-button{width:100%}.detail-grid{grid-template-columns:1fr}}
	/* Keep the actions visible while the fields scroll. */
	.invitation-body{display:grid;gap:14px;padding:24px;overflow-y:auto;font-size:13px}.invitation-body p{margin:0;color:var(--text-secondary)}.invitation-body label{display:grid;gap:6px;font-weight:600}.invitation-body input{width:100%;min-width:0;padding:9px;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--text);font-size:12px}.invitation-warning{color:var(--danger)!important}.invite-footer{display:flex;align-items:center;justify-content:flex-end;gap:12px;width:100%}.invite-footer span{color:var(--danger);font-size:12px}
	.invite-footer .primary,.invitation-dialog .primary{background:#337ab7!important;border-color:#286090}
	.roles-field{display:grid;gap:8px;margin:0;padding:12px;border:1px solid var(--border);border-radius:5px}.roles-field.invalid{border-color:var(--danger)}.roles-field legend{padding:0 4px;color:var(--text);font-size:12px;font-weight:500}.roles-field>small{color:var(--muted);font-size:11px}.role-options{display:flex;flex-wrap:wrap;gap:8px 18px}.role-options label{display:flex;align-items:center;gap:7px;color:var(--text-secondary);font-size:12px;font-weight:400}.role-options label.locked{color:var(--muted)}.role-options input{width:15px;height:15px;margin:0;accent-color:#1abb9c}.role-options input:focus-visible{outline:2px solid #1abb9c;outline-offset:2px}
	.export-button:disabled{cursor:not-allowed;opacity:.5}
</style>
