<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { apiData } from '$lib/api';
	import AssetManagementShell from '$lib/components/AssetManagementShell.svelte';
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
	type SortKey = 'employee' | 'age' | 'lengthOfService' | 'department' | 'group' | 'position' | 'employmentType' | 'branch' | 'roles';
	type SortOrder = 'asc' | 'desc';
	type DateField = 'birthDate' | 'hiredAt' | 'retiredAt';
	type SelectField = 'gender' | 'bloodType' | 'departmentId' | 'groupId' | 'positionId' | 'employmentTypeId' | 'branchId';
	type SelectOption = { value: string; label: string };
	type CalendarDay = { day: number; iso: string; inMonth: boolean };
	type ApiErrorDetail = { field?: string; reason: string };
	type ApiErrorPayload = { error?: { code?: string; message?: string; details?: ApiErrorDetail[] } };

	const resources = ['departments', 'employee-groups', 'positions', 'employment-types', 'branches'];
	const genders = [['female', 'Female'], ['male', 'Male'], ['unspecified', 'Unspecified']] as const;
	const bloodTypes = ['A', 'B', 'AB', 'O'];
	const requiredPickerFields = ['birthDate', 'gender', 'hiredAt', 'employmentTypeId', 'branchId'] as const;
	const pageSizeOptions = [10, 20, 30, 40, 50] as const;
	const pageSizeStorageKey = 'employees-page-size';
	const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
	const weekDays = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
	const blank = () => ({
		employeeCode: '', firstName: '', middleName: '', lastName: '', nameKana: '', birthDate: '', gender: '', bloodType: '',
		postalCode: '', prefecture: '', city: '', streetAddress: '', buildingName: '', mobilePhone: '', email: '',
		hiredAt: '', departmentId: '', groupId: '', positionId: '', employmentTypeId: '', branchId: '', retiredAt: '', notes: '', roleCodes: [] as string[]
	});

	const now = new Date();
	let items = $state<Employee[]>([]);
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
	let activeSelectField = $state<SelectField | null>(null);
	let selectAbove = $state(false);
	let calendarYear = $state(now.getFullYear());
	let calendarMonth = $state(now.getMonth());
	let search = $state('');
	let page = $state(1);
	let pageSize = $state<number>(10);
	let pageSizeOpen = $state(false);
	let total = $state(0);
	let sortBy = $state<SortKey>('employee');
	let sortOrder = $state<SortOrder>('asc');
	let loading = $state(false);
	let exporting = $state(false);
	let actionEmployee = $state<Employee | null>(null);
	let menuTop = $state(0);
	let menuLeft = $state(0);
	let menuTrigger: HTMLButtonElement | null = null;
	let pageSizeTrigger: HTMLButtonElement | null = null;
	let searchTimer: number | undefined;
	let listController: AbortController | null = null;

	let pageCount = $derived(Math.max(1, Math.ceil(total / pageSize)));
	let firstVisible = $derived(total === 0 ? 0 : (page - 1) * pageSize + 1);
	let lastVisible = $derived(Math.min(page * pageSize, total));

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

	function calendarDays(year: number, month: number): CalendarDay[] {
		const start = new Date(year, month, 1 - new Date(year, month, 1).getDay());
		return Array.from({ length: 42 }, (_, index) => {
			const date = new Date(start); date.setDate(start.getDate() + index);
			return { day: date.getDate(), iso: dateIso(date), inMonth: date.getMonth() === month };
		});
	}
	function openCalendar(field: DateField, value: string) {
		if (activeDateField === field) { activeDateField = null; return; }
		const date = value ? new Date(`${value}T00:00:00`) : new Date();
		calendarYear = date.getFullYear(); calendarMonth = date.getMonth(); activeDateField = field;
	}
	function moveMonth(offset: number) { const date = new Date(calendarYear, calendarMonth + offset, 1); calendarYear = date.getFullYear(); calendarMonth = date.getMonth(); }
	function chooseDate(field: DateField, value: string) { form[field] = value; clearFieldError(field); activeDateField = null; }
	function openFormSelect(trigger: HTMLButtonElement, field: SelectField, count: number) {
		const body = trigger.closest('.employee-form-body');
		const room = body?.getBoundingClientRect().bottom ?? window.innerHeight;
		const rect = trigger.getBoundingClientRect();
		const listHeight = Math.min(count * 28 + 8, 200);
		selectAbove = room - rect.bottom < listHeight + 4 && rect.top - (body?.getBoundingClientRect().top ?? 0) > room - rect.bottom;
		activeDateField = null;
		activeSelectField = field;
	}
	function toggleFormSelect(event: MouseEvent, field: SelectField, count: number) {
		event.stopPropagation();
		if (activeSelectField === field) { activeSelectField = null; return; }
		openFormSelect(event.currentTarget as HTMLButtonElement, field, count);
	}
	function chooseFormSelect(field: SelectField, value: string) {
		form[field] = value;
		clearFieldError(field);
		activeSelectField = null;
		document.querySelector<HTMLButtonElement>(`.form-select-picker[data-field="${field}"] .form-select-trigger`)?.focus();
	}
	function focusFormSelectOption(field: SelectField, index: number) {
		void tick().then(() => document.querySelectorAll<HTMLButtonElement>(`.form-select-picker[data-field="${field}"] .form-select-options button`)[index]?.focus());
	}
	function formSelectTriggerKeydown(event: KeyboardEvent, field: SelectField, options: SelectOption[]) {
		if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
		event.preventDefault();
		if (activeSelectField !== field) openFormSelect(event.currentTarget as HTMLButtonElement, field, options.length);
		const selected = options.findIndex((option) => option.value === form[field]);
		focusFormSelectOption(field, event.key === 'ArrowDown' ? Math.min(selected + 1, options.length - 1) : Math.max(selected - 1, 0));
	}
	function formSelectOptionKeydown(event: KeyboardEvent, field: SelectField, index: number, count: number) {
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			event.preventDefault();
			focusFormSelectOption(field, event.key === 'ArrowDown' ? Math.min(index + 1, count - 1) : Math.max(index - 1, 0));
		} else if (event.key === 'Home' || event.key === 'End') {
			event.preventDefault(); focusFormSelectOption(field, event.key === 'Home' ? 0 : count - 1);
		}
	}
	function formSelectFocusout(event: FocusEvent, field: SelectField) {
		const next = event.relatedTarget;
		if (activeSelectField === field && !(next instanceof Node && (event.currentTarget as HTMLElement).contains(next))) activeSelectField = null;
	}

	async function loadMasters() {
		const responses = await Promise.all(resources.map((resource) => fetch(`/v1/${resource}?limit=500`)));
		masters = Object.fromEntries(await Promise.all(responses.map(async (response, index) => [resources[index], response.ok ? await apiData<Master[]>(response) : []])));
	}
	async function loadRoleOptions() {
		const [roleResponse, sessionResponse] = await Promise.all([fetch('/v1/roles?sortBy=name&sortOrder=asc&limit=100'), fetch('/v1/auth/session')]);
		if (roleResponse.ok) roles = await apiData<Role[]>(roleResponse);
		if (sessionResponse.ok) currentUserRoles = (await apiData<{ user: { roles: string[] } }>(sessionResponse)).user.roles;
	}
	async function loadEmployees() {
		listController?.abort();
		const controller = new AbortController(); listController = controller; loading = true;
		const params = new URLSearchParams({ offset: String((page - 1) * pageSize), limit: String(pageSize), sortBy, sortOrder });
		if (search.trim()) params.set('search', search.trim());
		try {
			const response = await fetch(`/v1/employees?${params}`, { signal: controller.signal });
			if (!response.ok) { message = 'Unable to load employees.'; return; }
			const payload = await response.json() as ApiListPayload;
			items = payload.data; total = payload.meta.total;
			const maximumPage = Math.max(1, Math.ceil(total / pageSize));
			if (page > maximumPage) { page = maximumPage; await loadEmployees(); }
		} catch (error) {
			if (!(error instanceof DOMException && error.name === 'AbortError')) message = 'Unable to load employees.';
		} finally { if (listController === controller) loading = false; }
	}
	function focusEmployeeForm() { void tick().then(() => { if (formOpen) document.querySelector<HTMLInputElement>('.employee-form [name="employeeCode"]')?.focus(); }); }
	function resetFormErrors() { missingFields = []; fieldErrors = {}; formError = ''; }
	function create() { if (!canManageEmployees) return; closeMenu(); editing = null; form = blank(); resetFormErrors(); activeDateField = null; activeSelectField = null; formOpen = true; focusEmployeeForm(); }
	function edit(item: Employee) {
		if (!canManageEmployees) return;
		closeMenu(); editing = item;
		form = {
			employeeCode: item.employeeCode, firstName: item.firstName, middleName: item.middleName ?? '', lastName: item.lastName,
			nameKana: item.nameKana ?? '', birthDate: iso(item.birthDate), gender: item.gender ?? '', bloodType: item.bloodType ?? '',
			postalCode: item.postalCode ?? '', prefecture: item.prefecture ?? '', city: item.city ?? '', streetAddress: item.streetAddress ?? '',
			buildingName: item.buildingName ?? '', mobilePhone: item.mobilePhone ?? '', email: item.email ?? '',
			hiredAt: iso(item.hiredAt), departmentId: item.departmentId === null ? '' : String(item.departmentId), groupId: item.groupId === null ? '' : String(item.groupId),
			positionId: item.positionId === null ? '' : String(item.positionId), employmentTypeId: item.employmentTypeId === null ? '' : String(item.employmentTypeId),
			branchId: item.branchId === null ? '' : String(item.branchId), retiredAt: iso(item.retiredAt), notes: item.notes ?? '', roleCodes: item.roles.map((role) => role.code)
		};
		resetFormErrors(); activeDateField = null; activeSelectField = null; formOpen = true; focusEmployeeForm();
	}
	function roleIsLocked(roleCode: string) { return roleCode === 'system_administrator' && !currentUserRoles.includes('system_administrator'); }
	function toggleRole(roleCode: string) {
		if (roleIsLocked(roleCode)) return;
		form.roleCodes = form.roleCodes.includes(roleCode) ? form.roleCodes.filter((code) => code !== roleCode) : [...form.roleCodes, roleCode];
		clearFieldError('roleCodes');
	}
	function showDetail(item: Employee) { closeMenu(); detailEmployee = item; detailOpen = true; }
	function showInvitation(payload: InvitationPayload, email: string) {
		const url = new URL(payload.invitationUrl, window.location.origin);
		if (url.origin !== window.location.origin || url.pathname !== '/account-setup') throw new Error('Invalid invitation URL.');
		invitation = { url: url.href, email, expiresAt: payload.invitationExpiresAt };
		copyMessage = '';
		detailOpen = false;
		void tick().then(() => invitationDialogElement?.querySelector<HTMLInputElement>('input')?.focus());
	}
	function closeInvitation() { invitation = null; void tick().then(() => document.querySelector<HTMLButtonElement>('.add-button')?.focus()); }
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
			await loadEmployees();
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
		closeMenu(); if (!confirm(`Delete ${fullName(item)}?`)) return;
		const response = await fetch(`/v1/employees/${item.id}`, { method: 'DELETE' });
		if (!response.ok) { message = 'Unable to delete the employee.'; return; }
		message = 'Employee deleted.'; await loadEmployees();
	}
	function changeSort(field: SortKey) {
		if (sortBy === field) sortOrder = sortOrder === 'asc' ? 'desc' : 'asc'; else { sortBy = field; sortOrder = 'asc'; }
		page = 1; void loadEmployees();
	}
	function searchChanged() { page = 1; window.clearTimeout(searchTimer); searchTimer = window.setTimeout(() => void loadEmployees(), 350); }
	function pageSizeChanged() {
		if (!pageSizeOptions.includes(pageSize as typeof pageSizeOptions[number])) pageSize = 10;
		localStorage.setItem(pageSizeStorageKey, String(pageSize)); page = 1; void loadEmployees();
	}
	function togglePageSize(event: MouseEvent) {
		event.stopPropagation(); closeMenu(); pageSizeOpen = !pageSizeOpen;
	}
	function choosePageSize(size: number) {
		pageSize = size; pageSizeOpen = false; pageSizeChanged(); pageSizeTrigger?.focus();
	}
	function focusPageSizeOption(index: number) {
		pageSizeOpen = true;
		void tick().then(() => document.querySelectorAll<HTMLButtonElement>('.page-size-options button')[index]?.focus());
	}
	function pageSizeTriggerKeydown(event: KeyboardEvent) {
		if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
		event.preventDefault();
		const selectedIndex = pageSizeOptions.indexOf(pageSize as typeof pageSizeOptions[number]);
		focusPageSizeOption(event.key === 'ArrowDown' ? Math.min(selectedIndex + 1, pageSizeOptions.length - 1) : Math.max(selectedIndex - 1, 0));
	}
	function pageSizeOptionKeydown(event: KeyboardEvent, index: number) {
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			event.preventDefault();
			focusPageSizeOption(event.key === 'ArrowDown' ? Math.min(index + 1, pageSizeOptions.length - 1) : Math.max(index - 1, 0));
		} else if (event.key === 'Home' || event.key === 'End') {
			event.preventDefault(); focusPageSizeOption(event.key === 'Home' ? 0 : pageSizeOptions.length - 1);
		}
	}
	function goToPage(target: number) { if (target < 1 || target > pageCount || target === page) return; page = target; closeMenu(); void loadEmployees(); }
	function paginationItems(): Array<number | 'ellipsis'> {
		if (pageCount <= 7) return Array.from({ length: pageCount }, (_, index) => index + 1);
		const values: Array<number | 'ellipsis'> = [1];
		if (page > 4) values.push('ellipsis');
		for (let value = Math.max(2, page - 1); value <= Math.min(pageCount - 1, page + 1); value += 1) values.push(value);
		if (page < pageCount - 3) values.push('ellipsis');
		values.push(pageCount); return values;
	}
	function toggleMenu(event: MouseEvent, item: Employee) {
		event.stopPropagation(); if (actionEmployee?.id === item.id) { closeMenu(); return; }
		menuTrigger = event.currentTarget as HTMLButtonElement;
		const rect = menuTrigger.getBoundingClientRect(); const menuWidth = 160; const menuHeight = 126;
		menuLeft = Math.max(8, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8));
		menuTop = rect.bottom + 6 + menuHeight > window.innerHeight - 8 ? rect.top - menuHeight - 6 : rect.bottom + 6; actionEmployee = item;
		void tick().then(() => document.querySelector<HTMLButtonElement>('.menu-popover button')?.focus());
	}
	function closeMenu() { actionEmployee = null; menuTrigger = null; }
	function closePopovers() { closeMenu(); pageSizeOpen = false; activeSelectField = null; }
	function windowKeydown(event: KeyboardEvent) {
		if (event.key !== 'Escape') return;
		if (invitation) closeInvitation();
		else if (pageSizeOpen) { pageSizeOpen = false; pageSizeTrigger?.focus(); }
		else if (actionEmployee) { const trigger = menuTrigger; closeMenu(); trigger?.focus(); }
		else if (activeSelectField) { const field = activeSelectField; activeSelectField = null; document.querySelector<HTMLButtonElement>(`.form-select-picker[data-field="${field}"] .form-select-trigger`)?.focus(); }
		else if (detailOpen) detailOpen = false; else if (formOpen) formOpen = false;
	}
	function csvCell(value: unknown) {
		let text = value === null || value === undefined ? '' : String(value);
		if (/^[=+\-@]/.test(text)) text = `'${text}`;
		return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
	}
	async function exportCsv() {
		if (!canManageEmployees) return;
		closeMenu(); exporting = true; message = '';
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
		const savedPageSize = Number(localStorage.getItem(pageSizeStorageKey));
		if (pageSizeOptions.includes(savedPageSize as typeof pageSizeOptions[number])) pageSize = savedPageSize;
		void Promise.all([loadMasters(), loadRoleOptions(), loadEmployees()]);
		return () => { window.clearTimeout(searchTimer); listController?.abort(); };
	});
</script>

<svelte:window onclick={closePopovers} onkeydown={windowKeydown} onscroll={closePopovers} onresize={closePopovers} />

{#snippet dateInput(label: string, field: DateField, value: string, above = false, required = false)}
	<div class="custom-date" class:above data-field={field}><span>{label}{#if required} <span class="required" aria-hidden="true">*</span>{/if}</span><button class="date-trigger" type="button" aria-label={`${label}${required ? ' (required)' : ''}: ${value || 'yyyy-mm-dd'}`} aria-describedby={fieldError(field) ? `${field}-error` : undefined} class:invalid={Boolean(fieldError(field))} aria-haspopup="dialog" aria-expanded={activeDateField === field} onclick={() => openCalendar(field, value)}><span class:placeholder={!value}>{value || 'yyyy-mm-dd'}</span><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M8 3v4M16 3v4M3.5 10h17" /></svg></button>
		{#if fieldError(field)}<span id={`${field}-error`} class="field-error" role="alert">{fieldError(field)}</span>{/if}
		{#if activeDateField === field}<div class="calendar-panel" role="dialog" aria-label={`${label} calendar`}><div class="calendar-head"><button type="button" aria-label="Previous month" onclick={() => moveMonth(-1)}>‹</button><strong>{monthNames[calendarMonth]} {calendarYear}</strong><button type="button" aria-label="Next month" onclick={() => moveMonth(1)}>›</button></div><div class="weekdays">{#each weekDays as day}<span>{day}</span>{/each}</div><div class="calendar-grid">{#each calendarDays(calendarYear, calendarMonth) as date}<button type="button" class:outside={!date.inMonth} class:today={date.iso === dateIso(now)} class:selected={date.iso === value} aria-label={date.iso} aria-pressed={date.iso === value} onclick={() => chooseDate(field, date.iso)}>{date.day}</button>{/each}</div><div class="calendar-actions">{#if !required}<button type="button" onclick={() => chooseDate(field, '')}>Clear</button>{/if}<button type="button" onclick={() => chooseDate(field, dateIso(new Date()))}>Today</button></div></div>{/if}
	</div>
{/snippet}
{#snippet formSelect(label: string, field: SelectField, options: SelectOption[], required = false)}
	<div class="form-select-field"><span>{label}{#if required} <span class="required" aria-hidden="true">*</span>{/if}</span><div class="form-select-picker" class:above={activeSelectField === field && selectAbove} data-field={field} onfocusout={(event) => formSelectFocusout(event, field)}>
		<button class="form-select-trigger" class:unselected={!form[field]} type="button" aria-label={`${label}${required ? ' (required)' : ''}`} aria-describedby={fieldError(field) ? `${field}-error` : undefined} class:invalid={Boolean(fieldError(field))} aria-haspopup="listbox" aria-expanded={activeSelectField === field} onclick={(event) => toggleFormSelect(event, field, options.length)} onkeydown={(event) => formSelectTriggerKeydown(event, field, options)}><span>{options.find((option) => option.value === form[field])?.label ?? '-'}</span><svg viewBox="0 0 10 6" aria-hidden="true"><path d="M1 1l4 4 4-4" /></svg></button>
		{#if activeSelectField === field}<div class="form-select-options" role="listbox" aria-label={label}>{#each options as option, index}<button type="button" role="option" tabindex="-1" aria-selected={form[field] === option.value} class:selected={form[field] === option.value} onclick={() => chooseFormSelect(field, option.value)} onkeydown={(event) => formSelectOptionKeydown(event, field, index, options.length)}>{option.label}</button>{/each}</div>{/if}
	</div>{#if fieldError(field)}<span id={`${field}-error`} class="field-error" role="alert">{fieldError(field)}</span>{/if}</div>
{/snippet}
{#snippet textInput(label: string, field: Exclude<keyof ReturnType<typeof blank>, 'roleCodes'>, placeholder: string, maximum: number, required = false, type = 'text', pattern: string | undefined = undefined, minimum: number | undefined = undefined)}
	<label><span>{label}{#if required} <span class="required" aria-hidden="true">*</span>{/if}</span><input name={field} value={form[field]} {required} {type} maxlength={maximum} minlength={minimum} {pattern} class:invalid={Boolean(fieldError(field))} aria-describedby={fieldError(field) ? `${field}-error` : undefined} aria-invalid={Boolean(fieldError(field))} {placeholder} oninput={(event) => updateTextField(field, event.currentTarget.value)} />{#if fieldError(field)}<span id={`${field}-error`} class="field-error" role="alert">{fieldError(field)}</span>{/if}</label>
{/snippet}
{#snippet sortIndicator(field: SortKey)}<span class="sort-indicator" class:ascending={sortBy === field && sortOrder === 'asc'} class:descending={sortBy === field && sortOrder === 'desc'} aria-hidden="true"></span>{/snippet}

<AssetManagementShell title="Employees" active="Employees">
	<div class="employees-page">
	<div class="heading"><div><p>PEOPLE DIRECTORY</p><h1>Employees</h1></div><button class="primary add-button" type="button" disabled={!canManageEmployees} onclick={create}><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M4 8h8M8 4v8" /></svg>Add employee</button></div>
	{#if message}<p class="notice">{message}</p>{/if}
	<section class="list-card">
		<header class="card-header"><div><h2>All employees</h2><p>Sortable, searchable, paginated.</p></div><button class="export-button" type="button" disabled={exporting || !canManageEmployees} onclick={() => void exportCsv()}>{exporting ? 'Exporting…' : 'Export CSV'}</button></header>
		<div class="table-toolbar"><label class="search-box"><span class="sr-only">Search employees</span><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="7" cy="7" r="5" /><path d="M11 11l3.5 3.5" /></svg><input bind:value={search} type="search" placeholder="Search..." oninput={searchChanged} /></label><div class="page-size">Show <div class="page-size-picker"><button bind:this={pageSizeTrigger} class="page-size-trigger" type="button" aria-haspopup="listbox" aria-expanded={pageSizeOpen} onclick={togglePageSize} onkeydown={pageSizeTriggerKeydown}><span>{pageSize}</span><svg viewBox="0 0 10 6" aria-hidden="true"><path d="M1 1l4 4 4-4" /></svg></button>{#if pageSizeOpen}<div class="page-size-options" role="listbox" aria-label="Entries per page">{#each pageSizeOptions as size, index}<button type="button" role="option" aria-selected={pageSize === size} class:selected={pageSize === size} onclick={() => choosePageSize(size)} onkeydown={(event) => pageSizeOptionKeydown(event, index)}>{size}</button>{/each}</div>{/if}</div> entries</div></div>
		<div class="table-responsive" onscroll={closeMenu}><table class="employee-table"><colgroup><col class="employee-column" /><col class="age-column" /><col class="service-column" /><col class="department-column" /><col class="group-column" /><col class="position-column" /><col class="employment-type-column" /><col class="branch-column" /><col class="roles-column" /><col class="actions-width-column" /></colgroup><thead><tr>
			<th aria-sort={sortBy === 'employee' ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}><button class="sort-button" type="button" onclick={() => changeSort('employee')}>Employee {@render sortIndicator('employee')}</button></th>
			<th aria-sort={sortBy === 'age' ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}><button class="sort-button" type="button" onclick={() => changeSort('age')}>{messages.employee.age} {@render sortIndicator('age')}</button></th>
			<th aria-sort={sortBy === 'lengthOfService' ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}><button class="sort-button" type="button" onclick={() => changeSort('lengthOfService')}>{messages.employee.lengthOfService} {@render sortIndicator('lengthOfService')}</button></th>
			<th aria-sort={sortBy === 'department' ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}><button class="sort-button" type="button" onclick={() => changeSort('department')}>Department {@render sortIndicator('department')}</button></th>
			<th aria-sort={sortBy === 'group' ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}><button class="sort-button" type="button" onclick={() => changeSort('group')}>Group {@render sortIndicator('group')}</button></th>
			<th aria-sort={sortBy === 'position' ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}><button class="sort-button" type="button" onclick={() => changeSort('position')}>Position {@render sortIndicator('position')}</button></th>
			<th aria-sort={sortBy === 'employmentType' ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}><button class="sort-button" type="button" onclick={() => changeSort('employmentType')}>Employment type {@render sortIndicator('employmentType')}</button></th>
			<th aria-sort={sortBy === 'branch' ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}><button class="sort-button" type="button" onclick={() => changeSort('branch')}>Branch {@render sortIndicator('branch')}</button></th>
			<th aria-sort={sortBy === 'roles' ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}><button class="sort-button" type="button" onclick={() => changeSort('roles')}>Roles {@render sortIndicator('roles')}</button></th>
			<th class="actions-column"><span class="sr-only">Actions</span></th>
		</tr></thead><tbody>
			{#if loading && items.length === 0}<tr><td class="empty" colspan="10">Loading employees…</td></tr>
			{:else if items.length === 0}<tr><td class="empty" colspan="10">No matches found</td></tr>
			{:else}{#each items as item (item.id)}<tr><td><div class="employee-cell"><span class="avatar">{initials(item)}</span><div><strong>{fullName(item)}</strong><small>{item.employeeCode}</small></div></div></td><td>{item.age}</td><td>{formatLengthOfService(item.lengthOfService)}</td><td>{item.departmentRef?.name ?? ''}</td><td>{item.group?.name ?? ''}</td><td>{item.position?.name ?? ''}</td><td>{item.employmentType?.name ?? ''}</td><td>{item.branch?.name ?? ''}</td><td><div class="role-badges">{#each item.roles as role}<span>{role.name}</span>{/each}</div></td><td class="actions-cell"><button class="kebab-button" type="button" aria-label={`Actions for ${fullName(item)}`} aria-haspopup="menu" aria-expanded={actionEmployee?.id === item.id} onclick={(event) => toggleMenu(event, item)}><svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><circle cx="3" cy="8" r="1.4" /><circle cx="8" cy="8" r="1.4" /><circle cx="13" cy="8" r="1.4" /></svg></button></td></tr>{/each}{/if}
		</tbody></table></div>
		<footer class="table-footer"><p>Showing {firstVisible}–{lastVisible} of {total}</p><nav class="pagination" aria-label="Employee table pages"><button type="button" disabled={page === 1} aria-label="First page" onclick={() => goToPage(1)}>&lt;&lt;</button><button type="button" disabled={page === 1} aria-label="Previous page" onclick={() => goToPage(page - 1)}>&lt;</button>{#each paginationItems() as value}{#if value === 'ellipsis'}<span>…</span>{:else}<button type="button" class:current={value === page} aria-current={value === page ? 'page' : undefined} onclick={() => goToPage(value)}>{value}</button>{/if}{/each}<button type="button" disabled={page === pageCount} aria-label="Next page" onclick={() => goToPage(page + 1)}>&gt;</button><button type="button" disabled={page === pageCount} aria-label="Last page" onclick={() => goToPage(pageCount)}>&gt;&gt;</button></nav></footer>
	</section>
	</div>

	{#if actionEmployee}<div class="menu-popover" role="menu" tabindex="-1" style:top={`${menuTop}px`} style:left={`${menuLeft}px`}><button type="button" role="menuitem" onclick={() => showDetail(actionEmployee!)}>Detail</button><button type="button" role="menuitem" disabled={!canManageEmployees} onclick={() => edit(actionEmployee!)}>Edit</button><div class="menu-separator"></div><button class="delete-item" type="button" role="menuitem" disabled={!canManageEmployees} onclick={() => void remove(actionEmployee!)}>Delete</button></div>{/if}

	{#if formOpen}<div class="backdrop" role="presentation"><dialog class="employee-dialog" open aria-modal="true" aria-labelledby="employee-form-title"><header><h2 id="employee-form-title">{editing ? 'Edit employee' : 'Add employee'}</h2><button class="modal-close" type="button" aria-label="Close employee form" onclick={() => formOpen = false}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg></button></header><form class="employee-form" onsubmit={(event) => { event.preventDefault(); void save(); }}><div class="employee-form-body">
		{#if formError}<div class="form-error-summary wide" role="alert"><strong>Unable to save employee</strong><span>{formError}</span></div>{/if}
		<h3>Basic information</h3>{@render textInput('Employee code', 'employeeCode', 'e.g. JPDEMO00000001', 64, true, 'text', '[A-Za-z0-9]{10,64}', 10)}{@render textInput('First name', 'firstName', 'e.g. Hana', 128, true)}{@render textInput('Middle name', 'middleName', 'e.g. Marie', 128)}{@render textInput('Last name', 'lastName', 'e.g. Yamada', 128, true)}{@render textInput('Name (Kana)', 'nameKana', 'e.g. ヤマダ ハナ', 255)}{@render dateInput('Birth date', 'birthDate', form.birthDate, false, true)}{@render formSelect('Gender', 'gender', [{ value: '', label: '-' }, ...genders.map(([value, label]) => ({ value, label }))], true)}{@render formSelect('Blood type', 'bloodType', [{ value: '', label: '-' }, ...bloodTypes.map((type) => ({ value: type, label: type }))])}
		<h3>Contact information</h3>{@render textInput('Postal code', 'postalCode', 'e.g. 100-0001', 8, false, 'text', '\\d{3}-?\\d{4}')}{@render textInput('Prefecture', 'prefecture', 'e.g. Tokyo', 64)}{@render textInput('City', 'city', 'e.g. Chiyoda', 128)}{@render textInput('Street address', 'streetAddress', 'e.g. Chiyoda 1-1', 255)}{@render textInput('Building', 'buildingName', 'e.g. Main Building 3F', 255)}{@render textInput('Mobile phone', 'mobilePhone', 'e.g. 090-1234-5678', 32, false, 'tel', '[+0-9][0-9 ()-]{6,31}')}{@render textInput('Email', 'email', 'e.g. hana@example.com', 254, true, 'email')}
		<h3>Employment</h3>{@render dateInput('Hire date', 'hiredAt', form.hiredAt, false, true)}{@render formSelect('Department', 'departmentId', [{ value: '', label: '-' }, ...(masters.departments ?? []).map((item) => ({ value: String(item.id), label: item.name }))])}{@render formSelect('Group', 'groupId', [{ value: '', label: '-' }, ...(masters['employee-groups'] ?? []).map((item) => ({ value: String(item.id), label: item.name }))])}{@render formSelect('Position', 'positionId', [{ value: '', label: '-' }, ...(masters.positions ?? []).map((item) => ({ value: String(item.id), label: item.name }))])}{@render formSelect('Employment type', 'employmentTypeId', [{ value: '', label: '-' }, ...(masters['employment-types'] ?? []).map((item) => ({ value: String(item.id), label: item.name }))], true)}{@render formSelect('Branch', 'branchId', [{ value: '', label: '-' }, ...(masters.branches ?? []).map((item) => ({ value: String(item.id), label: item.name }))], true)}{@render dateInput('Retirement date', 'retiredAt', form.retiredAt, true)}<label class="wide">Notes<textarea name="notes" value={form.notes} maxlength="5000" class:invalid={Boolean(fieldError('notes'))} aria-describedby={fieldError('notes') ? 'notes-error' : undefined} aria-invalid={Boolean(fieldError('notes'))} placeholder="e.g. Notes about this employee" oninput={(event) => updateTextField('notes', event.currentTarget.value)}></textarea>{#if fieldError('notes')}<span id="notes-error" class="field-error" role="alert">{fieldError('notes')}</span>{/if}</label>
		<h3>Access</h3><fieldset class="roles-field wide" class:invalid={Boolean(fieldError('roleCodes'))}><legend>Roles <span class="required" aria-hidden="true">*</span></legend><div class="role-options">{#each roles as role}<label class:locked={roleIsLocked(role.code)}><input type="checkbox" checked={form.roleCodes.includes(role.code)} disabled={roleIsLocked(role.code)} onchange={() => toggleRole(role.code)} /><span>{role.name}</span></label>{/each}</div>{#if fieldError('roleCodes')}<span class="field-error" role="alert">{fieldError('roleCodes')}</span>{/if}{#if !currentUserRoles.includes('system_administrator')}<small>Only a System Administrator can change the System Administrator role.</small>{/if}</fieldset></div><footer class="employee-form-footer"><button class="secondary" type="button" disabled={saving} onclick={() => formOpen = false}>Cancel</button><button class="primary save-button" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save employee'}</button></footer>
	</form></dialog></div>{/if}

	{#if detailOpen && detailEmployee}<div class="backdrop" role="presentation"><dialog class="employee-dialog" open aria-modal="true" aria-labelledby="employee-detail-title"><header><div><p class="dialog-pretitle">{detailEmployee.employeeCode}</p><h2 id="employee-detail-title">Employee detail</h2></div><button class="modal-close" type="button" aria-label="Close employee detail" onclick={() => detailOpen = false}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg></button></header><div class="detail-body">
		<section><h3>Basic information</h3><dl class="detail-grid"><div><dt>Employee code</dt><dd>{detailEmployee.employeeCode}</dd></div><div><dt>First name</dt><dd>{detailEmployee.firstName}</dd></div><div><dt>Middle name</dt><dd>{display(detailEmployee.middleName)}</dd></div><div><dt>Last name</dt><dd>{detailEmployee.lastName}</dd></div><div><dt>Name (Kana)</dt><dd>{display(detailEmployee.nameKana)}</dd></div><div><dt>Birth date</dt><dd>{formatDate(detailEmployee.birthDate)}</dd></div><div><dt>{messages.employee.age}</dt><dd>{detailEmployee.age}</dd></div><div><dt>{messages.employee.lengthOfService}</dt><dd>{formatLengthOfService(detailEmployee.lengthOfService)}</dd></div><div><dt>Gender</dt><dd>{display(detailEmployee.gender)}</dd></div><div><dt>Blood type</dt><dd>{display(detailEmployee.bloodType)}</dd></div></dl></section>
		<section><h3>Contact information</h3><dl class="detail-grid"><div><dt>Postal code</dt><dd>{display(detailEmployee.postalCode)}</dd></div><div><dt>Prefecture</dt><dd>{display(detailEmployee.prefecture)}</dd></div><div><dt>City</dt><dd>{display(detailEmployee.city)}</dd></div><div><dt>Street address</dt><dd>{display(detailEmployee.streetAddress)}</dd></div><div><dt>Building</dt><dd>{display(detailEmployee.buildingName)}</dd></div><div><dt>Mobile phone</dt><dd>{display(detailEmployee.mobilePhone)}</dd></div><div><dt>Email</dt><dd>{display(detailEmployee.email)}</dd></div></dl></section>
		<section><h3>Employment</h3><dl class="detail-grid"><div><dt>Hire date</dt><dd>{formatDate(detailEmployee.hiredAt)}</dd></div><div><dt>Retirement date</dt><dd>{formatDate(detailEmployee.retiredAt)}</dd></div><div><dt>Department</dt><dd>{display(detailEmployee.departmentRef?.name)}</dd></div><div><dt>Group</dt><dd>{display(detailEmployee.group?.name)}</dd></div><div><dt>Position</dt><dd>{display(detailEmployee.position?.name)}</dd></div><div><dt>Employment type</dt><dd>{display(detailEmployee.employmentType?.name)}</dd></div><div><dt>Branch</dt><dd>{display(detailEmployee.branch?.name)}</dd></div><div class="wide"><dt>Notes</dt><dd class="notes-value">{display(detailEmployee.notes)}</dd></div></dl></section>
		<section><h3>System information</h3><dl class="detail-grid"><div><dt>Roles</dt><dd><span class="role-badges">{#each detailEmployee.roles as role}<span>{role.name}</span>{/each}</span></dd></div><div><dt>Created at</dt><dd>{formatTimestampDate(detailEmployee.createdAt)}</dd></div><div><dt>Updated at</dt><dd>{formatTimestampDate(detailEmployee.updatedAt)}</dd></div><div><dt>Deleted at</dt><dd>{formatTimestampDate(detailEmployee.deletedAt)}</dd></div></dl></section>
	</div>{#if currentUserRoles.includes('system_administrator') && detailEmployee.canIssueInvitation}<footer class="employee-form-footer"><div class="invite-footer">{#if invitationError}<span role="alert">{invitationError}</span>{/if}<button class="primary" type="button" disabled={issuingInvitation} onclick={() => void issueInvitation(detailEmployee!)}>{issuingInvitation ? 'Generating…' : 'Generate invitation link'}</button></div></footer>{/if}</dialog></div>{/if}
	{#if invitation}<div class="backdrop" role="presentation"><dialog bind:this={invitationDialogElement} class="employee-dialog invitation-dialog" open aria-modal="true" aria-labelledby="invitation-title"><header><h2 id="invitation-title">Employee invitation link</h2><button class="modal-close" type="button" aria-label="Close invitation" onclick={closeInvitation}>×</button></header><div class="invitation-body"><p>Send this link to <strong>{invitation.email}</strong> yourself. It is shown only now and expires at {new Date(invitation.expiresAt).toLocaleString()}.</p><label>Invitation URL<input aria-label="Invitation URL" readonly value={invitation.url} onclick={(event) => event.currentTarget.select()} /></label><p class="invitation-warning">Anyone with this link can set the account password until it expires. Share it only with the intended employee.</p>{#if copyMessage}<p role="status">{copyMessage}</p>{/if}</div><footer class="employee-form-footer"><button class="secondary" type="button" onclick={closeInvitation}>Close</button><button class="primary" type="button" onclick={() => void copyInvitation()}>Copy link</button></footer></dialog></div>{/if}
</AssetManagementShell>

<style>
	.employee-table{table-layout:fixed}
	.employee-table{min-width:1450px}
	.employee-column{width:18%}
	.age-column{width:6%}
	.service-column{width:12%}
	.department-column{width:10%}
	.group-column{width:9%}
	.position-column{width:9%}
	.employment-type-column{width:11%}
	.branch-column{width:9%}
	.roles-column{width:11%}
	.actions-width-column{width:5%}
	.employee-table td{overflow-wrap:anywhere}
	.employee-cell>div{min-width:0}
	.role-badges{display:flex;flex-wrap:wrap;gap:4px}.role-badges>span{display:inline-flex;align-items:center;min-height:20px;padding:2px 7px;background:rgba(26,187,156,.12);color:#169f85;border:1px solid rgba(26,187,156,.28);border-radius:999px;font-size:10px;font-weight:600;line-height:1.2}
	.employees-page{display:flex;height:calc(100dvh - 124px);min-height:0;flex-direction:column}.heading{display:flex;flex:none;align-items:flex-start;justify-content:space-between;margin-bottom:24px}.heading p,.dialog-pretitle{margin:0;color:#1abb9c;font-size:11px;font-weight:700}.heading h1{margin:4px 0;font-size:30px}.primary,.secondary,.export-button{display:inline-flex;align-items:center;justify-content:center;height:32px;padding:0 12px;border:1px solid var(--border);border-radius:4px;font-size:12.5px;font-weight:500;line-height:1}.primary{background:#1abb9c!important;border-color:#169f85;color:#fff!important}.secondary,.export-button{background:var(--surface)!important;color:var(--text-secondary)!important}.export-button{box-shadow:var(--shadow);transition:background 120ms,border-color 120ms,color 120ms,box-shadow 120ms;white-space:nowrap}.export-button:hover{background:var(--surface-secondary)!important;color:var(--text)!important}.export-button:disabled{cursor:wait;opacity:.6}.add-button{gap:5px;white-space:nowrap;transition:background 120ms,border-color 120ms,color 120ms,box-shadow 120ms}.add-button:hover{background:#169f85!important}.add-button svg{width:14px;height:14px}.export-button:focus,.add-button:focus{outline:none}.export-button:focus-visible,.add-button:focus-visible{outline:2px solid #1abb9c;outline-offset:2px}.notice{flex:none;margin:0 0 14px;color:#169f85}.list-card{display:flex;min-height:0;flex:0 1 auto;flex-direction:column;overflow:hidden;background:var(--surface);border:1px solid var(--border);border-radius:6px;box-shadow:var(--shadow)}.card-header{display:flex;flex:none;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid var(--border-light)}.card-header h2{margin:0;color:var(--text);font-size:14px}.card-header p{margin:1px 0 0;color:var(--muted);font-size:11.5px}.table-toolbar{display:flex;flex:none;align-items:center;justify-content:space-between;gap:12px;padding:12px 16px;border-bottom:1px solid var(--border-light)}.search-box{position:relative;display:block;width:220px}.search-box svg{position:absolute;top:50%;left:9px;width:14px;height:14px;color:var(--muted);pointer-events:none;transform:translateY(-50%)}.search-box input{width:100%;height:32px;padding:0 10px 0 32px;font-size:13px;background:var(--bg);outline:none;transition:border-color 150ms,box-shadow 150ms}.search-box input:focus{border-color:#1abb9c;box-shadow:0 0 0 3px rgba(26,187,156,.14)}.page-size{display:flex;align-items:center;gap:7px;color:var(--muted);font-size:12px}.page-size-picker{position:relative}.page-size-trigger{display:flex;align-items:center;justify-content:space-between;width:62px;height:32px;margin:0;padding:0 8px;background:var(--surface)!important;color:var(--text)!important;border:1px solid var(--border);border-radius:6px;font-size:12px}.page-size-trigger:focus,.page-size-trigger:focus-visible,.page-size-trigger[aria-expanded='true']{border-color:#1abb9c;outline:0;box-shadow:0 0 0 3px rgba(26,187,156,.14)}.page-size-trigger svg{width:10px;height:6px;fill:none;stroke:var(--muted);stroke-width:1.5}.page-size-trigger[aria-expanded='true'] svg{transform:rotate(180deg)}.page-size-options{position:absolute;top:calc(100% + 4px);right:0;z-index:20;width:62px;padding:3px;background:var(--surface);border:1px solid var(--border);border-radius:6px;box-shadow:0 8px 18px rgba(15,23,42,.12)}.page-size-options button{display:block;width:100%;height:28px;margin:0;padding:0 7px;background:transparent!important;color:var(--text)!important;border:0;border-radius:3px;text-align:left;font-size:12px}.page-size-options button:hover,.page-size-options button:focus-visible{background:var(--surface-secondary)!important;outline:0}.page-size-options button.selected{background:#1abb9c!important;color:#fff!important}.table-responsive{min-height:0;flex:0 1 auto;overflow:auto}table{min-width:720px;overflow:visible;border-radius:0;box-shadow:none;font-size:13px}th{position:sticky;top:0;z-index:2;padding:8px 16px;background:var(--surface-secondary);font-size:11px;font-weight:700;letter-spacing:.3px}td{padding:8px 16px;color:var(--text-secondary);vertical-align:middle;border-bottom-color:var(--border-light)}tbody tr{transition:background 80ms}tbody tr:hover{background:var(--surface-secondary)}tbody tr:last-child td{border-bottom:0}.sort-button{display:inline-flex;align-items:center;gap:6px;margin:0;padding:0;background:transparent!important;color:var(--muted)!important;border-radius:2px;font-size:inherit;font-weight:inherit;letter-spacing:inherit;text-transform:uppercase}.sort-button:focus-visible{outline:2px solid #1abb9c;outline-offset:3px}.sort-indicator{position:relative;width:10px;height:14px;opacity:.75}.sort-indicator::before,.sort-indicator::after{position:absolute;left:1px;width:0;height:0;content:'';border-right:4px solid transparent;border-left:4px solid transparent}.sort-indicator::before{top:1px;border-bottom:4px solid var(--muted)}.sort-indicator::after{bottom:1px;border-top:4px solid var(--muted)}.sort-indicator.ascending::before{border-bottom-color:#1abb9c}.sort-indicator.ascending::after{opacity:.3}.sort-indicator.descending::before{opacity:.3}.sort-indicator.descending::after{border-top-color:#1abb9c}.employee-cell{display:flex;align-items:center;gap:8px}.avatar{display:grid;flex:0 0 24px;height:24px;place-items:center;background:#1abb9c;color:#fff;border-radius:50%;font-size:9px;font-weight:600}.employee-cell strong{display:block;color:var(--text);font-weight:500}.employee-cell small{display:block;color:var(--muted);font-size:11px}.actions-column{width:48px}.actions-cell{text-align:right}.empty{height:96px;color:var(--muted);text-align:center}.table-footer{display:flex;flex:none;align-items:center;justify-content:space-between;gap:12px;padding:12px 16px;border-top:1px solid var(--border-light)}.table-footer p{margin:0;color:var(--muted);font-size:12px}.pagination{display:flex;align-items:center;gap:4px}.pagination button{display:inline-flex;align-items:center;justify-content:center;min-width:28px;height:28px;margin:0;padding:0 8px;background:var(--surface)!important;color:var(--text-secondary)!important;border:1px solid var(--border);border-radius:4px;font-size:12px;font-weight:500}.pagination button:hover:not(:disabled):not(.current){background:var(--surface-secondary)!important;color:var(--text)!important}.pagination button.current{background:#1abb9c!important;color:#fff!important;border-color:#169f85}.pagination button:disabled{cursor:not-allowed;opacity:.5}.pagination span{padding:0 4px;color:var(--muted)}.backdrop{position:fixed;inset:0;z-index:1200;display:grid;place-items:center;padding:20px;background:#0f162366}.employee-dialog{display:flex;flex-direction:column;width:min(100%,900px);height:min(90vh,760px);padding:0;overflow:hidden;background:var(--surface);color:var(--text);border:1px solid var(--border);border-radius:8px}.employee-dialog>header{display:flex;flex:none;align-items:center;justify-content:space-between;padding:24px;border-bottom:1px solid var(--border)}.employee-dialog h2{margin:0}.dialog-pretitle{margin-bottom:3px}.modal-close{display:grid;place-items:center;width:34px;height:34px;margin:0;padding:7px;background:transparent!important;color:var(--muted)!important;border:0;border-radius:4px}.modal-close:hover{background:var(--bg)!important}.modal-close svg{width:18px;height:18px}.employee-form{display:grid;flex:1;min-height:0;grid-template-columns:repeat(3,1fr);gap:12px;overflow-y:auto;padding:0 24px 24px;background:var(--bg)}.employee-form h3,.employee-form footer{grid-column:1/-1;margin:10px 0 0}.employee-form label{display:grid;gap:5px;font-size:13px}.employee-form input,.employee-form textarea{padding:8px;border:1px solid var(--border);border-radius:4px;background:var(--surface);color:var(--text)}.employee-form textarea{min-height:80px}.wide,.employee-form footer{grid-column:1/-1}.employee-form footer{display:flex;justify-content:flex-end;gap:8px}.custom-date{position:relative;display:block;font-size:13px}.custom-date>span{display:block;margin-bottom:5px}.date-trigger{display:flex;align-items:center;justify-content:space-between;width:100%;height:35px;padding:0 8px;background:var(--surface)!important;color:var(--text)!important;border:1px solid var(--border);border-radius:4px;text-align:left}.date-trigger .placeholder{color:var(--muted)}.date-trigger svg{width:17px;height:17px;fill:none;stroke:var(--muted);stroke-width:1.5}.calendar-panel{position:absolute;top:calc(100% + 6px);left:0;z-index:20;width:280px;padding:12px;background:var(--surface);color:var(--text);border:1px solid var(--border);border-radius:6px;box-shadow:0 14px 36px rgba(0,0,0,.38)}.above .calendar-panel{top:auto;bottom:calc(100% + 6px)}.calendar-head{display:grid;grid-template-columns:30px 1fr 30px;align-items:center;margin-bottom:8px}.calendar-head strong{text-align:center;font-size:13px;font-weight:600}.calendar-head button,.calendar-actions button{margin:0;padding:0;background:transparent!important;color:var(--muted)!important}.calendar-head button{height:30px;font-size:22px}.weekdays,.calendar-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:3px}.weekdays span{padding:5px 0;color:var(--muted);font-size:10px;font-weight:600;text-align:center}.calendar-grid button{height:31px;margin:0;padding:0;background:transparent!important;color:var(--text)!important;border:1px solid transparent;border-radius:4px;font-size:12px}.calendar-grid button:hover{background:var(--surface-secondary)!important;border-color:var(--border)}.calendar-grid button.outside{color:var(--muted)!important;opacity:.55}.calendar-grid button.today{border-color:#1abb9c}.calendar-grid button.selected{background:#1abb9c!important;color:#fff!important;border-color:#1abb9c}.calendar-actions{display:flex;justify-content:space-between;margin-top:10px;padding-top:9px;border-top:1px solid var(--border)}.calendar-actions button{font-size:11px}.detail-body{flex:1;min-height:0;overflow-y:auto;padding:8px 24px 28px;background:var(--bg)}.detail-body section{margin-top:16px;padding:18px;background:var(--surface);border:1px solid var(--border);border-radius:6px}.detail-body h3{margin:0 0 14px;font-size:14px}.detail-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px 24px;margin:0}.detail-grid div{min-width:0}.detail-grid dt{margin-bottom:3px;color:var(--muted);font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.3px}.detail-grid dd{margin:0;overflow-wrap:anywhere;color:var(--text-secondary);font-size:13px}.notes-value{white-space:pre-wrap}.sr-only{position:absolute;width:1px;height:1px;padding:0;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}@media(max-width:700px){.heading,.card-header,.table-toolbar,.table-footer{align-items:stretch;flex-direction:column}.heading .primary,.export-button{width:100%}.search-box{width:100%}.page-size{justify-content:flex-end}.pagination{flex-wrap:wrap}.employee-form,.detail-grid{grid-template-columns:1fr}.calendar-panel{width:min(280px,calc(100vw - 80px))}}
	/* Keep the actions visible while the fields scroll. */
	.search-box input::placeholder{color:#c0c7cf}
	:global(html[data-theme='dark']) .search-box input::placeholder{color:#5a6473}
	.employee-form{display:flex;flex-direction:column;gap:0;overflow:hidden;padding:0;background:var(--surface)}
	.employee-form-body{display:grid;flex:1;min-height:0;grid-template-columns:repeat(3,minmax(0,1fr));align-content:start;align-items:start;gap:16px;overflow-y:auto;padding:16px 24px 24px;background:var(--bg)}
	.employee-form-body h3{grid-column:1/-1;margin:8px 0 0;font-size:14px}
	.form-error-summary{display:grid;gap:3px;margin-top:16px;padding:10px 12px;background:rgba(214,57,57,.08);color:var(--danger);border:1px solid rgba(214,57,57,.35);border-radius:5px;font-size:12px}.form-error-summary strong{font-size:12px}.form-error-summary span{color:var(--text-secondary);font-weight:400}
	.employee-form label{gap:6px;font-size:12px;font-weight:500;color:var(--text)}
	.employee-form .required{margin-left:2px;color:var(--danger)}
	.employee-form .field-error{color:var(--danger);font-size:11px}
	.employee-form .invalid{border-color:var(--danger)!important}
	.employee-form input:not([type='checkbox']),.employee-form textarea{display:block;width:100%;height:36px;padding:0 12px;border:1px solid var(--border);border-radius:4px;background-color:var(--surface);color:var(--text);font-size:13px;font-weight:400;outline:none;transition:border-color 150ms,box-shadow 150ms}
	.employee-form textarea{height:auto;min-height:90px;padding:8px 12px;line-height:1.5;resize:vertical}
	.employee-form input::placeholder,.employee-form textarea::placeholder,.date-trigger .placeholder{color:#c0c7cf}
	:global(html[data-theme='dark']) .employee-form input::placeholder,:global(html[data-theme='dark']) .employee-form textarea::placeholder,:global(html[data-theme='dark']) .date-trigger .placeholder{color:#5a6473}
	.employee-form input:not([type='checkbox']):hover:not(:focus),.employee-form textarea:hover:not(:focus),.date-trigger:hover:not(:focus){border-color:var(--muted)}
	.employee-form input:not([type='checkbox']):focus,.employee-form textarea:focus,.date-trigger:focus-visible,.date-trigger[aria-expanded='true']{border-color:#1abb9c;box-shadow:0 0 0 3px rgba(26,187,156,.14);outline:none}
	.employee-form .date-trigger{height:36px;padding:0 12px;transition:border-color 150ms,box-shadow 150ms}
	.employee-form-footer{display:flex;flex:none;justify-content:flex-end;gap:8px;margin:0!important;padding:16px 24px;border-top:1px solid var(--border-light);background:var(--surface)}
	.employee-form-footer button{margin:0;white-space:nowrap;transition:background 120ms,border-color 120ms,color 120ms,box-shadow 120ms}
	.employee-form-footer .secondary{box-shadow:var(--shadow)}.employee-form-footer .secondary:hover{background:var(--surface-secondary)!important;color:var(--text)!important}
	.employee-form-footer .save-button{background:#337ab7!important;border-color:#286090}.employee-form-footer .save-button:hover{background:#286090!important}
	.employee-form-footer button:disabled{cursor:wait;opacity:.65}
	.employee-form-footer button:focus-visible,.modal-close:focus-visible{outline:2px solid #337ab7;outline-offset:2px}
	.invitation-dialog{width:min(100%,620px);height:auto;max-height:90vh}.invitation-body{display:grid;gap:14px;padding:24px;overflow-y:auto;font-size:13px}.invitation-body p{margin:0;color:var(--text-secondary)}.invitation-body label{display:grid;gap:6px;font-weight:600}.invitation-body input{width:100%;min-width:0;padding:9px;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--text);font-size:12px}.invitation-warning{color:var(--danger)!important}.invite-footer{display:flex;align-items:center;justify-content:flex-end;gap:12px;width:100%}.invite-footer span{color:var(--danger);font-size:12px}
	.invite-footer .primary,.invitation-dialog .primary{background:#337ab7!important;border-color:#286090}
	.employee-form .calendar-head button:hover,.employee-form .calendar-actions button:hover{background:var(--surface-secondary)!important;color:var(--text)!important}
	.employee-form .calendar-panel button:focus-visible{outline:2px solid #1abb9c;outline-offset:2px}
	.form-select-field{display:grid;gap:6px;min-width:0;color:var(--text);font-size:12px;font-weight:500}
	.roles-field{display:grid;gap:8px;margin:0;padding:12px;border:1px solid var(--border);border-radius:5px}.roles-field.invalid{border-color:var(--danger)}.roles-field legend{padding:0 4px;color:var(--text);font-size:12px;font-weight:500}.roles-field>small{color:var(--muted);font-size:11px}.role-options{display:flex;flex-wrap:wrap;gap:8px 18px}.role-options label{display:flex;align-items:center;gap:7px;color:var(--text-secondary);font-size:12px;font-weight:400}.role-options label.locked{color:var(--muted)}.role-options input{width:15px;height:15px;margin:0;accent-color:#1abb9c}.role-options input:focus-visible{outline:2px solid #1abb9c;outline-offset:2px}
	.form-select-picker{position:relative;min-width:0}
	.form-select-trigger{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;height:36px;margin:0;padding:0 12px;background:var(--surface)!important;color:var(--text)!important;border:1px solid var(--border);border-radius:4px;text-align:left;font-size:13px;font-weight:400;transition:border-color 150ms,box-shadow 150ms}
	.form-select-trigger>span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.form-select-trigger.unselected{color:#c0c7cf!important}:global(html[data-theme='dark']) .form-select-trigger.unselected{color:#5a6473!important}
	.form-select-trigger:hover:not(:focus){border-color:var(--muted)}.form-select-trigger:focus,.form-select-trigger:focus-visible,.form-select-trigger[aria-expanded='true']{border-color:#1abb9c;outline:0;box-shadow:0 0 0 3px rgba(26,187,156,.14)}
	.form-select-trigger svg{flex:none;width:10px;height:6px;fill:none;stroke:#9ba5b1;stroke-width:1.5}.form-select-trigger[aria-expanded='true'] svg{transform:rotate(180deg)}
	.form-select-options{position:absolute;top:calc(100% + 4px);left:0;z-index:30;width:100%;max-height:200px;overflow-y:auto;padding:3px;background:var(--surface);border:1px solid var(--border);border-radius:6px;box-shadow:0 8px 18px rgba(15,23,42,.12)}
	.form-select-picker.above .form-select-options{top:auto;bottom:calc(100% + 4px)}
	.form-select-options button{display:block;width:100%;min-height:28px;margin:0;padding:5px 7px;background:transparent!important;color:var(--text)!important;border:0;border-radius:3px;text-align:left;font-size:12px;line-height:18px}
	.form-select-options button:hover,.form-select-options button:focus-visible{background:var(--surface-secondary)!important;outline:0}.form-select-options button.selected{background:#1abb9c!important;color:#fff!important}
	.add-button:disabled,.export-button:disabled{cursor:not-allowed;opacity:.5}
	.add-button:disabled:hover{background:#1abb9c!important}
	@media(max-width:700px){.employee-form-body{grid-template-columns:1fr;padding:16px}.employee-form-footer{padding:12px 16px}}
</style>
