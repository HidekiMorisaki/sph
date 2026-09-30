<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { apiData } from '$lib/api';
	import type { Employee, EmployeeMaster, EmployeeRole } from '$lib/employees';
	import { genderOptions, localization } from '$lib/localization';
	import { formSnapshot } from '$lib/modalForm';
	import DatePicker from './DatePicker.svelte';
	import DiscardChangesDialog from './DiscardChangesDialog.svelte';
	import FormSection from './FormSection.svelte';
	import ModalBackdrop from './ModalBackdrop.svelte';
	import SearchSelect from './SearchSelect.svelte';
	import SearchMultiSelect from './SearchMultiSelect.svelte';

	type Mode = 'create' | 'admin-edit';
	type DateField = 'birthDate' | 'hiredAt' | 'retiredAt';
	type SelectField = 'gender' | 'bloodType' | 'primaryDepartmentId' | 'groupId' | 'employmentTypeId' | 'branchId';
	type SelectOption = { value: string; label: string; searchTerms?: string[] };
	type ApiErrorDetail = { field?: string; reason: string };
	type ApiErrorPayload = { error?: { code?: string; message?: string; details?: ApiErrorDetail[] } };
	type SavedEmployee = Employee;

	let {
		mode,
		employee = null,
		masters = {},
		roles = [],
		canManageSystemSettings = false,
		returnFocus = null,
		onClose,
		onSaved
	}: {
		mode: Mode;
		employee?: Employee | null;
		masters?: Record<string, EmployeeMaster[]>;
		roles?: EmployeeRole[];
		canManageSystemSettings?: boolean;
		returnFocus?: HTMLElement | null;
		onClose: () => void;
		onSaved: (employee: SavedEmployee) => void | Promise<void>;
	} = $props();

	const bloodTypes = ['A', 'B', 'AB', 'O'];
	const blank = () => ({
		employeeCode: '', firstName: '', middleName: '', lastName: '', nameKana: '', birthDate: '', gender: '', bloodType: '',
		postalCode: '', prefecture: '', city: '', streetAddress: '', buildingName: '', mobilePhone: '', email: '',
		hiredAt: '', departmentIds: [] as string[], primaryDepartmentId: '', groupId: '', positionIds: [] as string[], employmentTypeId: '', branchId: '', retiredAt: '', notes: '', roleIds: [] as string[]
	});
	type Form = ReturnType<typeof blank>;

	let dialogElement = $state<HTMLDialogElement>();
	let form = $state(blank());
	let missingFields = $state<string[]>([]);
	let fieldErrors = $state<Record<string, string>>({});
	let formError = $state('');
	let saving = $state(false);
	let activeDateField = $state<DateField | null>(null);
	let initialSnapshot = $state('');
	let confirmingDiscard = $state(false);
	let genders = $derived(genderOptions($localization));
	let availableGroups = $derived((masters['employee-groups'] ?? []).filter((item) => item.departmentId != null && String(item.departmentId) === form.primaryDepartmentId));
	let selectedDepartmentOptions = $derived((masters.departments ?? []).filter((item) => form.departmentIds.includes(String(item.id))).map((item) => ({ value: String(item.id), label: item.name })));
	let hasUnsavedChanges = $derived(mode !== 'create' && initialSnapshot !== '' && formSnapshot(adminPayload()) !== initialSnapshot);

	const iso = (value: string | null | undefined) => value ? value.slice(0, 10) : '';
	const fieldError = (field: string) => fieldErrors[field] ?? (missingFields.includes(field) ? (field === 'roleIds' ? 'Select at least one role.' : 'This field is required.') : '');
	function initializeForm() {
		if (!employee) { form = blank(); return; }
		const full = employee;
		form = {
			employeeCode: full?.employeeCode ?? '', firstName: employee.firstName, middleName: employee.middleName ?? '', lastName: employee.lastName,
			nameKana: employee.nameKana ?? '', birthDate: iso(employee.birthDate), gender: employee.gender ?? '', bloodType: employee.bloodType ?? '',
			postalCode: employee.postalCode ?? '', prefecture: employee.prefecture ?? '', city: employee.city ?? '', streetAddress: employee.streetAddress ?? '',
			buildingName: employee.buildingName ?? '', mobilePhone: employee.mobilePhone ?? '', email: employee.email ?? '',
			hiredAt: iso(full?.hiredAt), departmentIds: full?.departmentIds?.map(String) ?? (full?.departmentId == null ? [] : [String(full.departmentId)]), primaryDepartmentId: full?.primaryDepartmentId == null ? (full?.departmentId == null ? '' : String(full.departmentId)) : String(full.primaryDepartmentId), groupId: full?.groupId == null ? '' : String(full.groupId),
			positionIds: full?.positionIds?.map(String) ?? (full?.positionId == null ? [] : [String(full.positionId)]), employmentTypeId: full?.employmentTypeId == null ? '' : String(full.employmentTypeId),
			branchId: full?.branchId == null ? '' : String(full.branchId), retiredAt: iso(full?.retiredAt), notes: full?.notes ?? '', roleIds: full?.roles.map((role) => String(role.id)) ?? []
		};
		if (!availableGroups.some((group) => String(group.id) === form.groupId)) form.groupId = '';
	}
	function clearFieldError(field: string) {
		if (fieldErrors[field]) { const next = { ...fieldErrors }; delete next[field]; fieldErrors = next; }
		missingFields = missingFields.filter((name) => name !== field);
		if (!Object.keys(fieldErrors).length && !missingFields.length) formError = '';
	}
	function updateTextField(field: Exclude<keyof Form, 'roleIds' | 'positionIds' | 'departmentIds'>, value: string) { form[field] = value; clearFieldError(field); }
	function chooseDepartments(values: string[]) {
		form.departmentIds = values;
		if (!values.includes(form.primaryDepartmentId)) form.primaryDepartmentId = values[0] ?? '';
		if (!availableGroups.some((group) => String(group.id) === form.groupId)) form.groupId = '';
		clearFieldError('departmentIds'); clearFieldError('primaryDepartmentId'); clearFieldError('groupId');
	}
	function choosePositions(values: string[]) { form.positionIds = values; clearFieldError('positionIds'); clearFieldError('primaryPositionId'); }
	function chooseSelect(field: SelectField, value: string) {
		form[field] = value;
		clearFieldError(field);
		if (field !== 'primaryDepartmentId') return;
		if (!availableGroups.some((group) => String(group.id) === form.groupId)) form.groupId = '';
		clearFieldError('groupId');
	}
	function chooseDate(field: DateField, value: string) { form[field] = value; clearFieldError(field); activeDateField = null; }
	function roleIsLocked(role: EmployeeRole) { return Boolean(role.isSystemManagement) && !canManageSystemSettings; }
	function toggleRole(role: EmployeeRole) {
		if (roleIsLocked(role)) return;
		const roleId = String(role.id);
		form.roleIds = form.roleIds.includes(roleId) ? form.roleIds.filter((id) => id !== roleId) : [...form.roleIds, roleId];
		clearFieldError('roleIds');
	}
	function closeImmediately() {
		confirmingDiscard = false;
		if (saving) return;
		onClose();
		void tick().then(() => returnFocus?.focus());
	}
	function requestClose() {
		if (saving) return;
		activeDateField = null;
		if (hasUnsavedChanges) { confirmingDiscard = true; return; }
		closeImmediately();
	}
	function focusFormField(field: string) {
		const normalizedField = field === 'primaryPositionId' ? 'positionIds' : field === 'departmentId' ? 'departmentIds' : field;
		const selector = normalizedField === 'roleIds' ? '.roles-field input:not(:disabled)' : ['positionIds', 'departmentIds'].includes(normalizedField) ? `.form-multi-select-picker[data-field="${normalizedField}"] .form-multi-select-trigger` : normalizedField === 'birthDate' || normalizedField === 'hiredAt' || normalizedField === 'retiredAt' ? `.custom-date[data-field="${normalizedField}"] .date-trigger` : ['gender', 'bloodType', 'primaryDepartmentId', 'groupId', 'employmentTypeId', 'branchId'].includes(normalizedField) ? `.form-select-picker[data-field="${normalizedField}"] .form-select-trigger` : `[name="${normalizedField}"]`;
		dialogElement?.querySelector<HTMLElement>(selector)?.focus();
	}
	function adminPayload() { return { ...form, primaryDepartmentId: form.primaryDepartmentId || null, primaryPositionId: form.positionIds[0] ?? null }; }
	async function save() {
		formError = ''; fieldErrors = {};
		const pickerFields = ['birthDate', 'gender', 'hiredAt', 'employmentTypeId', 'branchId'];
		missingFields = [...pickerFields.filter((field) => !form[field as keyof Form]), ...(!form.roleIds.length ? ['roleIds'] : [])];
		if (missingFields.length) { focusFormField(missingFields[0]); return; }
		const endpoint = mode === 'admin-edit' && employee ? `/v1/employees/${employee.id}` : '/v1/employees';
		saving = true;
		try {
			const response = await fetch(endpoint, { method: mode === 'create' ? 'POST' : 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(adminPayload()) });
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
		if (event.defaultPrevented || confirmingDiscard || event.key !== 'Escape') return;
		if (activeDateField) { const field = activeDateField; activeDateField = null; void tick().then(() => focusFormField(field)); return; }
		requestClose();
	}

	onMount(() => {
		initializeForm();
		initialSnapshot = formSnapshot(adminPayload());
		void tick().then(() => dialogElement?.querySelector<HTMLInputElement>('[name="employeeCode"]')?.focus());
	});
</script>

<svelte:window onkeydown={windowKeydown} />

{#snippet dateInput(label: string, field: DateField, value: string, above = false, required = false)}
	<DatePicker {label} {field} {value} {above} {required} error={fieldError(field)} open={activeDateField === field} onToggle={() => activeDateField = activeDateField === field ? null : field} onSelect={(selected) => chooseDate(field, selected)} />
{/snippet}
{#snippet formSelect(label: string, field: SelectField, options: SelectOption[], required = false, disabled = false)}
	<SearchSelect {label} {field} value={form[field]} {options} {required} {disabled} error={fieldError(field)} onOpen={() => activeDateField = null} onSelect={(value) => chooseSelect(field, value)} />
{/snippet}
{#snippet textInput(label: string, field: Exclude<keyof Form, 'roleIds' | 'positionIds' | 'departmentIds'>, placeholder: string, maximum: number, required = false, type = 'text', pattern: string | undefined = undefined, minimum: number | undefined = undefined)}
	<label><span>{label}{#if required} <span class="required" aria-hidden="true">*</span>{/if}</span><input name={field} value={form[field]} {required} {type} maxlength={maximum} minlength={minimum} {pattern} class:invalid={Boolean(fieldError(field))} aria-describedby={fieldError(field) ? `${field}-error` : undefined} aria-invalid={Boolean(fieldError(field))} {placeholder} oninput={(event) => updateTextField(field, event.currentTarget.value)} />{#if fieldError(field)}<span id={`${field}-error`} class="field-error" role="alert">{fieldError(field)}</span>{/if}</label>
{/snippet}

<ModalBackdrop onDismiss={requestClose} disabled={saving}>
	<dialog bind:this={dialogElement} class="employee-dialog app-modal" open aria-modal="true" aria-labelledby="employee-form-title">
		<header><h2 id="employee-form-title">{mode === 'create' ? 'Add employee' : 'Edit employee'}</h2><button class="app-modal-close" type="button" aria-label="Close employee form" disabled={saving} onclick={requestClose}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg></button></header>
		<form class="employee-form app-modal-form" novalidate onsubmit={(event) => { event.preventDefault(); void save(); }}>
			<div class="app-modal-form-body">
				{#if formError}<div class="app-modal-error-summary wide" role="alert"><strong>Unable to save employee</strong><span>{formError}</span></div>{/if}
				<FormSection title="Basic information" framed>
					{@render textInput('Employee code', 'employeeCode', 'e.g. JPDEMO00000001', 64, true, 'text', '[A-Za-z0-9]{10,64}', 10)}
					{@render textInput('First name', 'firstName', 'e.g. Hana', 128, true)}{@render textInput('Middle name', 'middleName', 'e.g. Marie', 128)}{@render textInput('Last name', 'lastName', 'e.g. Yamada', 128, true)}{@render textInput('Name (Kana)', 'nameKana', 'e.g. ヤマダ ハナ', 255)}{@render dateInput('Birth date', 'birthDate', form.birthDate, false, true)}{@render formSelect('Gender', 'gender', [{ value: '', label: '-' }, ...genders], true)}{@render formSelect('Blood type', 'bloodType', [{ value: '', label: '-' }, ...bloodTypes.map((type) => ({ value: type, label: type }))])}
				</FormSection>
				<FormSection title="Contact information" framed>
					{@render textInput('Postal code', 'postalCode', 'e.g. 100-0001', 8, false, 'text', '\\d{3}-?\\d{4}')}{@render textInput('Prefecture', 'prefecture', 'e.g. Tokyo', 64)}{@render textInput('City', 'city', 'e.g. Chiyoda', 128)}{@render textInput('Street address', 'streetAddress', 'e.g. Chiyoda 1-1', 255)}{@render textInput('Building', 'buildingName', 'e.g. Main Building 3F', 255)}{@render textInput('Mobile phone', 'mobilePhone', 'e.g. 090-1234-5678', 32, false, 'tel', '[+0-9][0-9 ()-]{6,31}')}{@render textInput('Email', 'email', 'e.g. hana@example.com', 254, true, 'email')}
				</FormSection>
					<FormSection title="Employment" framed>
						{@render dateInput('Hire date', 'hiredAt', form.hiredAt, false, true)}<SearchMultiSelect label="Departments" field="departmentIds" values={form.departmentIds} options={(masters.departments ?? []).map((item) => ({ value: String(item.id), label: item.name }))} error={fieldError('departmentIds')} onOpen={() => activeDateField = null} onChange={chooseDepartments} />{@render formSelect('Primary department', 'primaryDepartmentId', [{ value: '', label: '-' }, ...selectedDepartmentOptions], false, !form.departmentIds.length)}{@render formSelect('Group', 'groupId', [{ value: '', label: '-' }, ...availableGroups.map((item) => ({ value: String(item.id), label: item.name }))], false, !form.primaryDepartmentId)}<SearchMultiSelect label="Positions" field="positionIds" values={form.positionIds} options={(masters.positions ?? []).map((item) => ({ value: String(item.id), label: item.name }))} error={fieldError('positionIds') || fieldError('primaryPositionId')} onOpen={() => activeDateField = null} onChange={choosePositions} />{@render formSelect('Employment type', 'employmentTypeId', [{ value: '', label: '-' }, ...(masters['employment-types'] ?? []).map((item) => ({ value: String(item.id), label: item.name }))], true)}{@render formSelect('Branch', 'branchId', [{ value: '', label: '-' }, ...(masters.branches ?? []).map((item) => ({ value: String(item.id), label: item.name }))], true)}{@render dateInput('Retirement date', 'retiredAt', form.retiredAt, true)}
					</FormSection>
					<FormSection title="Additional information" framed>
						<label class="wide">Notes<textarea name="notes" value={form.notes} maxlength="5000" class:invalid={Boolean(fieldError('notes'))} aria-describedby={fieldError('notes') ? 'notes-error' : undefined} aria-invalid={Boolean(fieldError('notes'))} placeholder="e.g. Notes about this employee" oninput={(event) => updateTextField('notes', event.currentTarget.value)}></textarea>{#if fieldError('notes')}<span id="notes-error" class="field-error" role="alert">{fieldError('notes')}</span>{/if}</label>
					</FormSection>
					<FormSection title="Access" framed>
						<fieldset class="roles-field wide" class:invalid={Boolean(fieldError('roleIds'))}><legend>Roles <span class="required" aria-hidden="true">*</span></legend><div class="role-options">{#each roles as role}<label class:locked={roleIsLocked(role)}><input type="checkbox" checked={form.roleIds.includes(String(role.id))} disabled={roleIsLocked(role)} onchange={() => toggleRole(role)} /><span>{role.name}</span></label>{/each}</div>{#if fieldError('roleIds')}<span class="field-error" role="alert">{fieldError('roleIds')}</span>{/if}{#if !canManageSystemSettings}<small>Only a System Administrator can change a role with system management permission.</small>{/if}</fieldset>
					</FormSection>
			</div>
			<footer class="app-modal-footer"><button class="secondary" type="button" disabled={saving} onclick={requestClose}>Cancel</button><button class="app-primary-action" type="submit" disabled={saving}>{saving ? 'Saving…' : mode === 'create' ? 'Add employee' : 'Save changes'}</button></footer>
		</form>
	</dialog>
</ModalBackdrop>
{#if confirmingDiscard}<DiscardChangesDialog onContinue={() => confirmingDiscard = false} onDiscard={closeImmediately} />{/if}

<style>
	.wide{grid-column:1/-1}
	.roles-field{display:grid;gap:8px;margin:0;padding:12px;border:1px solid var(--border);border-radius:5px}.roles-field.invalid{border-color:var(--danger)}.roles-field legend{padding:0 4px;color:var(--text);font-size:12px;font-weight:500}.roles-field>small{color:var(--muted);font-size:11px}.role-options{display:flex;flex-wrap:wrap;gap:8px 18px}.role-options label{display:flex;align-items:center;gap:7px;color:var(--text-secondary);font-size:12px;font-weight:400}.role-options label.locked{color:var(--muted)}.role-options input{width:15px;height:15px;margin:0;accent-color:#1abb9c}.role-options input:focus-visible{outline:2px solid #1abb9c;outline-offset:2px}
</style>
