<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { apiData } from '$lib/api';
	import AddButton from '$lib/components/AddButton.svelte';
	import AssetManagementShell from '$lib/components/AssetManagementShell.svelte';
	import EmployeeDetailModal from '$lib/components/EmployeeDetailModal.svelte';
	import EmployeeFormModal from '$lib/components/EmployeeFormModal.svelte';
	import MasterList from '$lib/components/MasterList.svelte';
	import { employeeFullName, type Employee, type EmployeeMaster, type EmployeeRole, type EmployeeProfile } from '$lib/employees';
	import { en as messages } from '$lib/ui/messages';

	type InvitationPayload = { invitationUrl: string; invitationExpiresAt: string };
	type ExportColumn = { key: string; columnName: string; comment: string | null };
	type ListMeta = { offset: number; limit: number; returned: number; total: number; hasMore: boolean; search: string; calculatedAsOf: string; sort: { field: string; order: 'asc' | 'desc' }; columns?: ExportColumn[] };
	type ApiListPayload = { status: 'success'; responseCode: number; data: Employee[]; meta: ListMeta };

	const resources = ['departments', 'employee-groups', 'positions', 'employment-types', 'branches'];

	let employeeList = $state<MasterList>();
	let editing = $state<Employee | EmployeeProfile | null>(null);
	let formMode = $state<'create' | 'admin-edit' | 'self-edit'>('create');
	let formReturnFocus = $state<HTMLElement | null>(null);
	let detailEmployee = $state<Employee | null>(null);
	let detailReturnFocus = $state<HTMLElement | null>(null);
	let formOpen = $state(false);
	let detailOpen = $state(false);
	let invitation = $state<{ url: string; email: string; expiresAt: string } | null>(null);
	let invitationDialogElement = $state<HTMLDialogElement>();
	let invitationError = $state('');
	let issuingInvitation = $state(false);
	let copyMessage = $state('');
	let message = $state('');
	let masters = $state<Record<string, EmployeeMaster[]>>({});
	let roles = $state<EmployeeRole[]>([]);
	let currentUserRoles = $state<string[]>([]);
	let currentUserId = $state<number | null>(null);
	let canManageEmployees = $derived(currentUserRoles.includes('system_administrator') || currentUserRoles.includes('business_administrator'));
	let exporting = $state(false);

	const dateIso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
	const fullName = employeeFullName;
	const initials = (item: Employee) => `${item.firstName.charAt(0)}${item.lastName.charAt(0)}`.toUpperCase();
	const formatLengthOfService = (value: Employee['lengthOfService']) => `${value.years} ${value.years === 1 ? messages.employee.year : messages.employee.years} ${value.months} ${value.months === 1 ? messages.employee.month : messages.employee.months}`;
	async function loadMasters() {
		const responses = await Promise.all(resources.map((resource) => fetch(`/v1/${resource}?limit=500`)));
		masters = Object.fromEntries(await Promise.all(responses.map(async (response, index) => [resources[index], response.ok ? await apiData<EmployeeMaster[]>(response) : []])));
	}
	async function loadRoleOptions() {
		const [roleResponse, sessionResponse] = await Promise.all([fetch('/v1/roles?sortBy=name&sortOrder=asc&limit=100'), fetch('/v1/auth/session')]);
		if (roleResponse.ok) roles = await apiData<EmployeeRole[]>(roleResponse);
		if (sessionResponse.ok) {
			const current = (await apiData<{ user: { id: number; roles: string[] } }>(sessionResponse)).user;
			currentUserRoles = current.roles;
			currentUserId = current.id;
		}
	}
	function create(event: MouseEvent) { if (!canManageEmployees) return; editing = null; formMode = 'create'; formReturnFocus = event.currentTarget as HTMLElement; formOpen = true; }
	async function edit(item: Employee, trigger: HTMLButtonElement | null) {
		if (!canManageEmployees && item.id !== currentUserId) return;
		formReturnFocus = trigger;
		if (canManageEmployees) {
			editing = item;
			formMode = 'admin-edit';
			formOpen = true;
			return;
		}
		try {
			const response = await fetch('/v1/employees/me');
			if (!response.ok) { message = 'Unable to load your profile.'; return; }
			editing = await apiData<EmployeeProfile>(response);
			formMode = 'self-edit';
		} catch { message = 'Unable to load your profile.'; return; }
		formOpen = true;
	}
	async function formSaved(saved: Employee | EmployeeProfile) {
		message = formMode === 'create' ? 'Employee created.' : 'Employee updated.';
		if (formMode === 'create' && 'invitationUrl' in saved && typeof saved.invitationUrl === 'string' && 'invitationExpiresAt' in saved && typeof saved.invitationExpiresAt === 'string') {
			showInvitation({ invitationUrl: saved.invitationUrl, invitationExpiresAt: saved.invitationExpiresAt }, saved.email);
		}
		await employeeList?.refresh();
	}
	function showDetail(item: Employee, trigger: HTMLButtonElement | null) { detailEmployee = item; detailReturnFocus = trigger; detailOpen = true; }
	function closeDetail() { detailOpen = false; detailEmployee = null; invitationError = ''; }
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
{#snippet employeeCell(item: Employee)}<div class="employee-cell"><span class="avatar">{initials(item)}</span><div><strong>{fullName(item)}</strong><small>{item.employeeCode}</small></div></div>{/snippet}
{#snippet rolesCell(item: Employee)}<div class="role-badges">{#each item.roles as role}<span>{role.name}</span>{/each}</div>{/snippet}
{#snippet exportAction()}<button class="export-button" type="button" disabled={exporting || !canManageEmployees} onclick={() => void exportCsv()}>{exporting ? 'Exporting…' : 'Export CSV'}</button>{/snippet}
{#snippet invitationAction()}<div class="invite-footer">{#if invitationError}<span role="alert">{invitationError}</span>{/if}<button class="app-primary-action" type="button" disabled={issuingInvitation} onclick={() => void issueInvitation(detailEmployee!)}>{issuingInvitation ? 'Generating…' : 'Generate invitation link'}</button></div>{/snippet}

<AssetManagementShell title="Employees" active="Employees">
	<div class="employees-page">
	<div class="heading"><div><p>PEOPLE DIRECTORY</p><h1>Employees</h1></div><AddButton label="Add employee" disabled={!canManageEmployees} onclick={create} /></div>
	{#if message}<p class="notice">{message}</p>{/if}
	<MasterList bind:this={employeeList} endpoint="/v1/employees" title="Employees" listHeading="All employees" description="Sortable, searchable, paginated." initialSortBy="employee" pageSizeStorageKey="employees-page-size" minTableWidth={1120} edgePagination canManage={canManageEmployees} canDetail={true} canEdit={(item) => canManageEmployees || item.id === currentUserId} canDelete={canManageEmployees} actionLabel={(item) => fullName(item as Employee)} headerActions={exportAction} loadingLabel="Loading employees…" emptyLabel="No matches found" columns={[
		{ key: 'employee', label: 'Employee', width: 18, cell: employeeCell },
		{ key: 'age', label: messages.employee.age, width: 6, value: (item) => (item as Employee).age },
		{ key: 'lengthOfService', label: messages.employee.lengthOfService, width: 12, value: (item) => formatLengthOfService((item as Employee).lengthOfService) },
		{ key: 'department', label: 'Department', width: 10, value: (item) => (item as Employee).departmentRef?.name },
		{ key: 'group', label: 'Group', width: 9, value: (item) => (item as Employee).group?.name },
		{ key: 'position', label: 'Position', width: 9, value: (item) => (item as Employee).position?.name },
		{ key: 'employmentType', label: 'Employment type', width: 11, value: (item) => (item as Employee).employmentType?.name },
		{ key: 'branch', label: 'Branch', width: 9, value: (item) => (item as Employee).branch?.name },
		{ key: 'roles', label: 'Roles', width: 11, cell: rolesCell }
	]} onDetail={(item, trigger) => showDetail(item as Employee, trigger)} onEdit={(item, trigger) => edit(item as Employee, trigger)} onDelete={(item) => remove(item as Employee)} />
	</div>

	{#if formOpen}<EmployeeFormModal mode={formMode} employee={editing} {masters} {roles} {currentUserRoles} returnFocus={formReturnFocus} onClose={() => formOpen = false} onSaved={formSaved} />{/if}

	{#if detailOpen && detailEmployee}<EmployeeDetailModal employee={detailEmployee} returnFocus={detailReturnFocus} footer={currentUserRoles.includes('system_administrator') && detailEmployee.canIssueInvitation ? invitationAction : undefined} onClose={closeDetail} />{/if}
	{#if invitation}<div class="backdrop app-modal-backdrop" role="presentation"><dialog bind:this={invitationDialogElement} class="employee-dialog invitation-dialog app-modal app-modal--invitation" open aria-modal="true" aria-labelledby="invitation-title"><header><h2 id="invitation-title">Employee invitation link</h2><button class="modal-close app-modal-close" type="button" aria-label="Close invitation" onclick={closeInvitation}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg></button></header><div class="invitation-body"><p>Send this link to <strong>{invitation.email}</strong> yourself. It is shown only now and expires at {new Date(invitation.expiresAt).toLocaleString()}.</p><label>Invitation URL<input aria-label="Invitation URL" readonly value={invitation.url} onclick={(event) => event.currentTarget.select()} /></label><p class="invitation-warning">Anyone with this link can set the account password until it expires. Share it only with the intended employee.</p>{#if copyMessage}<p role="status">{copyMessage}</p>{/if}</div><footer class="employee-form-footer app-modal-footer"><button class="secondary" type="button" onclick={closeInvitation}>Close</button><button class="app-primary-action" type="button" onclick={() => void copyInvitation()}>Copy link</button></footer></dialog></div>{/if}
</AssetManagementShell>

<style>
	.employee-cell>div{min-width:0}
	.role-badges{display:flex;flex-wrap:wrap;gap:4px}.role-badges>span{display:inline-flex;align-items:center;min-height:20px;padding:2px 7px;background:rgba(26,187,156,.12);color:#169f85;border:1px solid rgba(26,187,156,.28);border-radius:999px;font-size:10px;font-weight:600;line-height:1.2}
	.employees-page{display:flex;height:calc(100dvh - 124px);min-height:0;flex-direction:column}.heading{display:flex;flex:none;align-items:flex-start;justify-content:space-between;margin-bottom:24px}.heading p{margin:0;color:#1abb9c;font-size:11px;font-weight:700}.heading h1{margin:4px 0;font-size:30px}.export-button{display:inline-flex;align-items:center;justify-content:center;height:32px;padding:0 12px;background:var(--surface)!important;color:var(--text-secondary)!important;border:1px solid var(--border);border-radius:4px;box-shadow:var(--shadow);font-size:12.5px;font-weight:500;line-height:1;transition:background 120ms,border-color 120ms,color 120ms,box-shadow 120ms;white-space:nowrap}.export-button:hover{background:var(--surface-secondary)!important;color:var(--text)!important}.export-button:disabled{cursor:wait;opacity:.6}.export-button:focus{outline:none}.export-button:focus-visible{outline:2px solid #1abb9c;outline-offset:2px}.notice{flex:none;margin:0 0 14px;color:#169f85}.employee-cell{display:flex;align-items:center;gap:8px}.avatar{display:grid;flex:0 0 24px;height:24px;place-items:center;background:#1abb9c;color:#fff;border-radius:50%;font-size:9px;font-weight:600}.employee-cell strong{display:block;color:var(--text);font-weight:500}.employee-cell small{display:block;color:var(--muted);font-size:11px}@media(max-width:700px){.heading{align-items:stretch;flex-direction:column}.export-button{width:100%}}
	/* Keep the actions visible while the fields scroll. */
	.invitation-body{display:grid;gap:14px;padding:24px;overflow-y:auto;font-size:13px}.invitation-body p{margin:0;color:var(--text-secondary)}.invitation-body label{display:grid;gap:6px;font-weight:600}.invitation-body input{width:100%;min-width:0;padding:9px;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--text);font-size:12px}.invitation-warning{color:var(--danger)!important}.invite-footer{display:flex;align-items:center;justify-content:flex-end;gap:12px;width:100%}.invite-footer span{color:var(--danger);font-size:12px}
	.export-button:disabled{cursor:not-allowed;opacity:.5}
</style>
