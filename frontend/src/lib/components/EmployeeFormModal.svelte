<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { apiData } from '$lib/api';
	import type { Employee, EmployeeMaster, EmployeeProfile, EmployeeRole } from '$lib/employees';
	import DatePicker from './DatePicker.svelte';
	import FormSection from './FormSection.svelte';
	import SearchSelect from './SearchSelect.svelte';

	type Mode = 'create' | 'admin-edit' | 'self-edit';
	type DateField = 'birthDate' | 'hiredAt' | 'retiredAt';
	type SelectField = 'gender' | 'bloodType' | 'departmentId' | 'groupId' | 'positionId' | 'employmentTypeId' | 'branchId';
	type SelectOption = { value: string; label: string; searchTerms?: string[] };
	type ApiErrorDetail = { field?: string; reason: string };
	type ApiErrorPayload = { error?: { code?: string; message?: string; details?: ApiErrorDetail[] } };
	type SavedEmployee = Employee | EmployeeProfile;

	let {
		mode,
		employee = null,
		masters = {},
		roles = [],
		currentUserRoles = [],
		returnFocus = null,
		onClose,
		onSaved
	}: {
		mode: Mode;
		employee?: Employee | EmployeeProfile | null;
		masters?: Record<string, EmployeeMaster[]>;
		roles?: EmployeeRole[];
		currentUserRoles?: string[];
		returnFocus?: HTMLElement | null;
		onClose: () => void;
		onSaved: (employee: SavedEmployee) => void | Promise<void>;
	} = $props();

	const genders = [['female', 'Female'], ['male', 'Male'], ['unspecified', 'Unspecified']] as const;
	const bloodTypes = ['A', 'B', 'AB', 'O'];
	const blank = () => ({
		employeeCode: '', firstName: '', middleName: '', lastName: '', nameKana: '', birthDate: '', gender: '', bloodType: '',
		postalCode: '', prefecture: '', city: '', streetAddress: '', buildingName: '', mobilePhone: '', email: '',
		hiredAt: '', departmentId: '', groupId: '', positionId: '', employmentTypeId: '', branchId: '', retiredAt: '', notes: '', roleCodes: [] as string[]
	});
	type Form = ReturnType<typeof blank>;

	let dialogElement = $state<HTMLDialogElement>();
	let form = $state(blank());
	let missingFields = $state<string[]>([]);
	let fieldErrors = $state<Record<string, string>>({});
	let formError = $state('');
	let saving = $state(false);
	let activeDateField = $state<DateField | null>(null);
	let selfEdit = $derived(mode === 'self-edit');

	const iso = (value: string | null | undefined) => value ? value.slice(0, 10) : '';
	const fieldError = (field: string) => fieldErrors[field] ?? (missingFields.includes(field) ? (field === 'roleCodes' ? 'Select at least one role.' : 'This field is required.') : '');
	function initializeForm() {
		if (!employee) { form = blank(); return; }
		const full = 'employeeCode' in employee ? employee : null;
		form = {
			employeeCode: full?.employeeCode ?? '', firstName: employee.firstName, middleName: employee.middleName ?? '', lastName: employee.lastName,
			nameKana: employee.nameKana ?? '', birthDate: iso(employee.birthDate), gender: employee.gender ?? '', bloodType: employee.bloodType ?? '',
			postalCode: employee.postalCode ?? '', prefecture: employee.prefecture ?? '', city: employee.city ?? '', streetAddress: employee.streetAddress ?? '',
			buildingName: employee.buildingName ?? '', mobilePhone: employee.mobilePhone ?? '', email: employee.email ?? '',
			hiredAt: iso(full?.hiredAt), departmentId: full?.departmentId == null ? '' : String(full.departmentId), groupId: full?.groupId == null ? '' : String(full.groupId),
			positionId: full?.positionId == null ? '' : String(full.positionId), employmentTypeId: full?.employmentTypeId == null ? '' : String(full.employmentTypeId),
			branchId: full?.branchId == null ? '' : String(full.branchId), retiredAt: iso(full?.retiredAt), notes: full?.notes ?? '', roleCodes: full?.roles.map((role) => role.code) ?? []
		};
	}
	function clearFieldError(field: string) {
		if (fieldErrors[field]) { const next = { ...fieldErrors }; delete next[field]; fieldErrors = next; }
		missingFields = missingFields.filter((name) => name !== field);
		if (!Object.keys(fieldErrors).length && !missingFields.length) formError = '';
	}
	function updateTextField(field: Exclude<keyof Form, 'roleCodes'>, value: string) { form[field] = value; clearFieldError(field); }
	function chooseDate(field: DateField, value: string) { form[field] = value; clearFieldError(field); activeDateField = null; }
	function roleIsLocked(roleCode: string) { return roleCode === 'system_administrator' && !currentUserRoles.includes('system_administrator'); }
	function toggleRole(roleCode: string) {
		if (roleIsLocked(roleCode)) return;
		form.roleCodes = form.roleCodes.includes(roleCode) ? form.roleCodes.filter((code) => code !== roleCode) : [...form.roleCodes, roleCode];
		clearFieldError('roleCodes');
	}
	function close() {
		if (saving) return;
		onClose();
		void tick().then(() => returnFocus?.focus());
	}
	function focusFormField(field: string) {
		const selector = field === 'roleCodes' ? '.roles-field input:not(:disabled)' : field === 'birthDate' || field === 'hiredAt' || field === 'retiredAt' ? `.custom-date[data-field="${field}"] .date-trigger` : ['gender', 'bloodType', 'departmentId', 'groupId', 'positionId', 'employmentTypeId', 'branchId'].includes(field) ? `.form-select-picker[data-field="${field}"] .form-select-trigger` : `[name="${field}"]`;
		dialogElement?.querySelector<HTMLElement>(selector)?.focus();
	}
	function selfPayload() {
		return {
			firstName: form.firstName, middleName: form.middleName, lastName: form.lastName, nameKana: form.nameKana,
			birthDate: form.birthDate, gender: form.gender, bloodType: form.bloodType, postalCode: form.postalCode,
			prefecture: form.prefecture, city: form.city, streetAddress: form.streetAddress, buildingName: form.buildingName,
			mobilePhone: form.mobilePhone, email: form.email
		};
	}
	async function save() {
		formError = ''; fieldErrors = {};
		const pickerFields = selfEdit ? ['birthDate', 'gender'] : ['birthDate', 'gender', 'hiredAt', 'employmentTypeId', 'branchId'];
		missingFields = [...pickerFields.filter((field) => !form[field as keyof Form]), ...(!selfEdit && !form.roleCodes.length ? ['roleCodes'] : [])];
		if (missingFields.length) { focusFormField(missingFields[0]); return; }
		const endpoint = selfEdit ? '/v1/employees/me' : mode === 'admin-edit' && employee ? `/v1/employees/${employee.id}` : '/v1/employees';
		saving = true;
		try {
			const response = await fetch(endpoint, { method: mode === 'create' ? 'POST' : 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(selfEdit ? selfPayload() : form) });
			if (!response.ok) {
				const body = await response.json().catch(() => null) as ApiErrorPayload | null;
				const details = body?.error?.details ?? [];
				fieldErrors = Object.fromEntries(details.flatMap((detail) => detail.field ? [[detail.field, detail.reason]] : []));
				formError = body?.error?.code === 'ROLE_ASSIGNMENT_FORBIDDEN' ? 'You cannot assign or remove the System Administrator role.' : body?.error?.code === 'LAST_SYSTEM_ADMINISTRATOR' ? 'The last System Administrator role cannot be removed.' : body?.error?.message ?? 'Unable to save the employee.';
				const firstField = details.find((detail) => detail.field)?.field;
				if (firstField) void tick().then(() => focusFormField(firstField));
				return;
			}
			const saved = await apiData<SavedEmployee>(response);
			await onSaved(saved);
			onClose();
			void tick().then(() => returnFocus?.focus());
		} catch { formError = 'Unable to save the employee. Check your connection and try again.'; }
		finally { saving = false; }
	}
	function windowKeydown(event: KeyboardEvent) {
		if (event.defaultPrevented || event.key !== 'Escape') return;
		if (activeDateField) { const field = activeDateField; activeDateField = null; void tick().then(() => focusFormField(field)); return; }
		close();
	}

	onMount(() => {
		initializeForm();
		void tick().then(() => dialogElement?.querySelector<HTMLInputElement>(selfEdit ? '[name="firstName"]' : '[name="employeeCode"]')?.focus());
	});
</script>

<svelte:window onkeydown={windowKeydown} />

{#snippet dateInput(label: string, field: DateField, value: string, above = false, required = false)}
	<DatePicker {label} {field} {value} {above} {required} error={fieldError(field)} open={activeDateField === field} onToggle={() => activeDateField = activeDateField === field ? null : field} onSelect={(selected) => chooseDate(field, selected)} />
{/snippet}
{#snippet formSelect(label: string, field: SelectField, options: SelectOption[], required = false)}
	<SearchSelect {label} {field} value={form[field]} {options} {required} error={fieldError(field)} onOpen={() => activeDateField = null} onSelect={(value) => { form[field] = value; clearFieldError(field); }} />
{/snippet}
{#snippet textInput(label: string, field: Exclude<keyof Form, 'roleCodes'>, placeholder: string, maximum: number, required = false, type = 'text', pattern: string | undefined = undefined, minimum: number | undefined = undefined)}
	<label><span>{label}{#if required} <span class="required" aria-hidden="true">*</span>{/if}</span><input name={field} value={form[field]} {required} {type} maxlength={maximum} minlength={minimum} {pattern} class:invalid={Boolean(fieldError(field))} aria-describedby={fieldError(field) ? `${field}-error` : undefined} aria-invalid={Boolean(fieldError(field))} {placeholder} oninput={(event) => updateTextField(field, event.currentTarget.value)} />{#if fieldError(field)}<span id={`${field}-error`} class="field-error" role="alert">{fieldError(field)}</span>{/if}</label>
{/snippet}

<div class="app-modal-backdrop" role="presentation">
	<dialog bind:this={dialogElement} class="employee-dialog app-modal" open aria-modal="true" aria-labelledby="employee-form-title">
		<header><h2 id="employee-form-title">{mode === 'create' ? 'Add employee' : selfEdit ? 'Profile' : 'Edit employee'}</h2><button class="app-modal-close" type="button" aria-label="Close employee form" disabled={saving} onclick={close}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg></button></header>
		<form class="employee-form app-modal-form" novalidate onsubmit={(event) => { event.preventDefault(); void save(); }}>
			<div class="app-modal-form-body">
				{#if formError}<div class="app-modal-error-summary wide" role="alert"><strong>Unable to save employee</strong><span>{formError}</span></div>{/if}
				<FormSection title="Basic information" framed>
					{#if !selfEdit}{@render textInput('Employee code', 'employeeCode', 'e.g. JPDEMO00000001', 64, true, 'text', '[A-Za-z0-9]{10,64}', 10)}{/if}
					{@render textInput('First name', 'firstName', 'e.g. Hana', 128, true)}{@render textInput('Middle name', 'middleName', 'e.g. Marie', 128)}{@render textInput('Last name', 'lastName', 'e.g. Yamada', 128, true)}{@render textInput('Name (Kana)', 'nameKana', 'e.g. ヤマダ ハナ', 255)}{@render dateInput('Birth date', 'birthDate', form.birthDate, false, true)}{@render formSelect('Gender', 'gender', [{ value: '', label: '-' }, ...genders.map(([value, label]) => ({ value, label }))], true)}{@render formSelect('Blood type', 'bloodType', [{ value: '', label: '-' }, ...bloodTypes.map((type) => ({ value: type, label: type }))])}
				</FormSection>
				<FormSection title="Contact information" framed>
					{@render textInput('Postal code', 'postalCode', 'e.g. 100-0001', 8, false, 'text', '\\d{3}-?\\d{4}')}{@render textInput('Prefecture', 'prefecture', 'e.g. Tokyo', 64)}{@render textInput('City', 'city', 'e.g. Chiyoda', 128)}{@render textInput('Street address', 'streetAddress', 'e.g. Chiyoda 1-1', 255)}{@render textInput('Building', 'buildingName', 'e.g. Main Building 3F', 255)}{@render textInput('Mobile phone', 'mobilePhone', 'e.g. 090-1234-5678', 32, false, 'tel', '[+0-9][0-9 ()-]{6,31}')}{@render textInput('Email', 'email', 'e.g. hana@example.com', 254, true, 'email')}
				</FormSection>
				{#if !selfEdit}
					<FormSection title="Employment" framed>
						{@render dateInput('Hire date', 'hiredAt', form.hiredAt, false, true)}{@render formSelect('Department', 'departmentId', [{ value: '', label: '-' }, ...(masters.departments ?? []).map((item) => ({ value: String(item.id), label: item.name }))])}{@render formSelect('Group', 'groupId', [{ value: '', label: '-' }, ...(masters['employee-groups'] ?? []).map((item) => ({ value: String(item.id), label: item.name }))])}{@render formSelect('Position', 'positionId', [{ value: '', label: '-' }, ...(masters.positions ?? []).map((item) => ({ value: String(item.id), label: item.name }))])}{@render formSelect('Employment type', 'employmentTypeId', [{ value: '', label: '-' }, ...(masters['employment-types'] ?? []).map((item) => ({ value: String(item.id), label: item.name }))], true)}{@render formSelect('Branch', 'branchId', [{ value: '', label: '-' }, ...(masters.branches ?? []).map((item) => ({ value: String(item.id), label: item.name }))], true)}{@render dateInput('Retirement date', 'retiredAt', form.retiredAt, true)}
					</FormSection>
					<FormSection title="Additional information" framed>
						<label class="wide">Notes<textarea name="notes" value={form.notes} maxlength="5000" class:invalid={Boolean(fieldError('notes'))} aria-describedby={fieldError('notes') ? 'notes-error' : undefined} aria-invalid={Boolean(fieldError('notes'))} placeholder="e.g. Notes about this employee" oninput={(event) => updateTextField('notes', event.currentTarget.value)}></textarea>{#if fieldError('notes')}<span id="notes-error" class="field-error" role="alert">{fieldError('notes')}</span>{/if}</label>
					</FormSection>
					<FormSection title="Access" framed>
						<fieldset class="roles-field wide" class:invalid={Boolean(fieldError('roleCodes'))}><legend>Roles <span class="required" aria-hidden="true">*</span></legend><div class="role-options">{#each roles as role}<label class:locked={roleIsLocked(role.code)}><input type="checkbox" checked={form.roleCodes.includes(role.code)} disabled={roleIsLocked(role.code)} onchange={() => toggleRole(role.code)} /><span>{role.name}</span></label>{/each}</div>{#if fieldError('roleCodes')}<span class="field-error" role="alert">{fieldError('roleCodes')}</span>{/if}{#if !currentUserRoles.includes('system_administrator')}<small>Only a System Administrator can change the System Administrator role.</small>{/if}</fieldset>
					</FormSection>
				{/if}
			</div>
			<footer class="app-modal-footer"><button class="secondary" type="button" disabled={saving} onclick={close}>Cancel</button><button class="app-primary-action" type="submit" disabled={saving}>{saving ? 'Saving…' : mode === 'create' ? 'Add employee' : 'Save changes'}</button></footer>
		</form>
	</dialog>
</div>

<style>
	.wide{grid-column:1/-1}
	.roles-field{display:grid;gap:8px;margin:0;padding:12px;border:1px solid var(--border);border-radius:5px}.roles-field.invalid{border-color:var(--danger)}.roles-field legend{padding:0 4px;color:var(--text);font-size:12px;font-weight:500}.roles-field>small{color:var(--muted);font-size:11px}.role-options{display:flex;flex-wrap:wrap;gap:8px 18px}.role-options label{display:flex;align-items:center;gap:7px;color:var(--text-secondary);font-size:12px;font-weight:400}.role-options label.locked{color:var(--muted)}.role-options input{width:15px;height:15px;margin:0;accent-color:#1abb9c}.role-options input:focus-visible{outline:2px solid #1abb9c;outline-offset:2px}
</style>
