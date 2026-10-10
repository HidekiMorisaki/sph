<script lang="ts">
	import { localeMessages, formatLocaleTemplate } from '$lib/locale-messages';
	import { onMount, tick } from 'svelte';
	import { apiData } from '$lib/api';
	import type { SessionUser } from '$lib/auth';
	import AddButton from '$lib/components/AddButton.svelte';
	import AssetManagementShell from '$lib/components/AssetManagementShell.svelte';
	import EmailAddressActions from '$lib/components/EmailAddressActions.svelte';
	import EmployeeDetailModal from '$lib/components/EmployeeDetailModal.svelte';
	import EmployeeFormModal from '$lib/components/EmployeeFormModal.svelte';
	import MasterList from '$lib/components/MasterList.svelte';
	import MasterPageHeader from '$lib/components/MasterPageHeader.svelte';
	import ModalBackdrop from '$lib/components/ModalBackdrop.svelte';
	import SearchMultiSelect from '$lib/components/SearchMultiSelect.svelte';
	import SearchSelect from '$lib/components/SearchSelect.svelte';
	import StatusNotice from '$lib/components/StatusNotice.svelte';
	import { allBranchesValue, nextBranchSelection, restoreBranchSelection } from '$lib/employee-branch-filter';
	import type { Employee, EmployeeMaster, EmployeeRole } from '$lib/employees';
	import { formatEmployeeName, formatLengthOfService, formatTimestamp, invitationEmailSubject, localization } from '$lib/localization';
	import { inferPersonNameLocale } from '$lib/person-name';

	let commonText = $derived(localeMessages[$localization.displayLanguage].common);
	let text = $derived(localeMessages[$localization.displayLanguage].employees);

	type InvitationPayload = { invitationUrl: string; invitationExpiresAt: string };
	type ExportColumn = { key: string; columnName: string; comment: string | null };
	type ListMeta = { offset: number; limit: number; returned: number; total: number; hasMore: boolean; search: string; calculatedAsOf: string; sort: { field: string; order: 'asc' | 'desc' }; columns?: ExportColumn[] };
	type ApiListPayload = { status: 'success'; responseCode: number; data: Employee[]; meta: ListMeta };

	const resources = ['departments', 'employee-groups', 'positions', 'employment-types'];

	let employeeList = $state<MasterList>();
	let editing = $state<Employee | null>(null);
	let formMode = $state<'create' | 'admin-edit'>('create');
	let formReturnFocus = $state<HTMLElement | null>(null);
	let detailEmployee = $state<Employee | null>(null);
	let detailReturnFocus = $state<HTMLElement | null>(null);
	let formOpen = $state(false);
	let detailOpen = $state(false);
	let invitation = $state<{ url: string; email: string; expiresAt: string } | null>(null);
	let invitationDialogElement = $state<HTMLDialogElement>();
	let invitationError = $state<'invitationRateLimited' | 'invitationFailed' | ''>('');
	let issuingInvitation = $state(false);
	let copyMessage = $state<'linkCopied' | 'linkCopyFailed' | ''>('');
	let invitationWarningDismissed = $state(false);
	let message = $state<'created' | 'updated' | 'removed' | 'deleteFailed' | 'exportFailed' | ''>('');
	let masters = $state<Record<string, EmployeeMaster[]>>({});
	let roles = $state<EmployeeRole[]>([]);
	let canManageAdministration = $state(false);
	let canManageSystemSettings = $state(false);
	let canInviteEmployees = $state(false);
	let canAssignEmployeeRoles = $state(false);
	let currentUserId = $state<number | null>(null);
	let canManageEmployees = $derived(canManageAdministration);
	let exporting = $state(false);
	let includeRetired = $state(false);
	let includeDeleted = $state(false);
	let branchOptions = $state<EmployeeMaster[]>([]);
	let branchSelection = $state<string[]>([allBranchesValue]);
	let branchFilterReady = $state(false);
	let branchFilterError = $state(false);
	let employeeQueryParams = $derived({ includeRetired, includeDeleted, ...(branchSelection.includes(allBranchesValue) ? {} : { branchIds: branchSelection.join(',') }) });

	const dateIso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
	const fullName = (employee: Employee) => formatEmployeeName(employee, $localization);
	const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
	function monogram(item: Employee): string {
		// CLDR short, formal monogram: Japanese uses given; other supported names use surname.
		const nameLocale = item.nameKana?.trim() ? 'ja' : inferPersonNameLocale(item);
		const name = nameLocale === 'ja' ? item.firstName : item.lastName;
		const first = graphemes.segment(name.trim())[Symbol.iterator]().next().value?.segment ?? '';
		const upper = first.toLocaleUpperCase(nameLocale === 'ja' ? 'ja' : 'en');
		return [...graphemes.segment(upper)].length === 1 ? upper : first;
	}
	async function loadMasters() {
		const responses = await Promise.all(resources.map((resource) => fetch(`/v1/${resource}?limit=500`)));
		masters = { ...masters, ...Object.fromEntries(await Promise.all(responses.map(async (response, index) => [resources[index], response.ok ? await apiData<EmployeeMaster[]>(response) : []]))) };
	}
	async function loadBranchOptions() {
		const collected: EmployeeMaster[] = [];
		let total = 0;
		do {
			const response = await fetch(`/v1/employees/branch-options?limit=500&offset=${collected.length}&sortBy=sortOrder&sortOrder=asc`);
			if (!response.ok) throw new Error('Unable to load branches.');
			const payload = await response.json() as { data: EmployeeMaster[]; meta: { total: number } };
			if (!payload.data.length && collected.length < payload.meta.total) throw new Error('Incomplete branch list.');
			collected.push(...payload.data);
			total = payload.meta.total;
		} while (collected.length < total);
		branchOptions = collected;
		masters = { ...masters, branches: collected };
	}
	async function loadRoleOptions() {
		const [roleResponse, sessionResponse] = await Promise.all([fetch('/v1/employees/assignable-roles'), fetch('/v1/auth/session')]);
		if (roleResponse.ok) roles = await apiData<EmployeeRole[]>(roleResponse);
		if (sessionResponse.ok) {
			const current = (await apiData<{ user: { id: number; capabilities: { canManageEmployees: boolean; canManageSystemSettings: boolean; canAssignEmployeeRoles: boolean; canInviteEmployees: boolean } } }>(sessionResponse)).user;
			canManageAdministration = current.capabilities.canManageEmployees;
			canManageSystemSettings = current.capabilities.canManageSystemSettings;
			canInviteEmployees = current.capabilities.canInviteEmployees;
			canAssignEmployeeRoles = current.capabilities.canAssignEmployeeRoles;
			currentUserId = current.id;
		} else throw new Error('Unable to load current user.');
	}
	async function initialize() {
		branchFilterError = false;
		try {
			await Promise.all([loadMasters(), loadBranchOptions(), loadRoleOptions()]);
			if (currentUserId === null) throw new Error('Current user unavailable.');
			const storageKey = `employees-branch-filter:${currentUserId}`;
			let saved: string | null = null;
			try { saved = localStorage.getItem(storageKey); } catch { /* Browsing without storage uses all branches. */ }
			branchSelection = branchOptions.length === 1 ? [String(branchOptions[0].id)] : restoreBranchSelection(saved, branchOptions.map((branch) => String(branch.id)));
			branchFilterReady = true;
			try { localStorage.setItem(storageKey, JSON.stringify(branchSelection.filter((value) => value !== allBranchesValue))); } catch { /* The filter still works for this visit. */ }
		} catch { branchFilterError = true; }
	}
	function chooseBranches(values: string[]) {
		if (branchOptions.length === 1) return;
		branchSelection = nextBranchSelection(branchSelection, values);
		if (currentUserId !== null) {
			try { localStorage.setItem(`employees-branch-filter:${currentUserId}`, JSON.stringify(branchSelection.filter((value) => value !== allBranchesValue))); } catch { /* The filter still works for this visit. */ }
		}
	}
	function create(event: MouseEvent) { if (!canManageEmployees) return; editing = null; formMode = 'create'; formReturnFocus = event.currentTarget as HTMLElement; formOpen = true; }
	function edit(item: Employee, trigger: HTMLButtonElement | null) {
		if (item.employmentStatus === 'deleted') return;
		if (!canManageEmployees && item.id !== currentUserId) return;
		if (!canManageEmployees) { window.location.assign('/settings#profile'); return; }
		formReturnFocus = trigger;
		editing = item;
		formMode = 'admin-edit';
		formOpen = true;
	}
	async function formSaved(saved: Employee) {
		message = formMode === 'create' ? 'created' : 'updated';
		if (saved.id === currentUserId) {
			try {
				const response = await fetch('/v1/auth/session', { cache: 'no-store' });
				if (!response.ok) throw new Error('Session refresh failed.');
				const current = (await apiData<{ user: SessionUser }>(response)).user;
				canManageAdministration = current.capabilities.canManageEmployees;
				canManageSystemSettings = current.capabilities.canManageSystemSettings;
				canInviteEmployees = current.capabilities.canInviteEmployees;
				canAssignEmployeeRoles = current.capabilities.canAssignEmployeeRoles;
				currentUserId = current.id;
				window.dispatchEvent(new CustomEvent<SessionUser>('session-user-updated', { detail: current }));
			} catch {
				// The edit succeeded; reload to recover the current session without reporting a failed save.
				window.location.reload();
				return;
			}
		}
		if (formMode === 'create' && 'invitationUrl' in saved && typeof saved.invitationUrl === 'string' && 'invitationExpiresAt' in saved && typeof saved.invitationExpiresAt === 'string') {
			showInvitation({ invitationUrl: saved.invitationUrl, invitationExpiresAt: saved.invitationExpiresAt }, saved.email);
		}
		await employeeList?.refresh();
	}
	function showDetail(item: Employee, trigger: HTMLElement | null) { detailEmployee = item; detailReturnFocus = trigger; detailOpen = true; }
	function closeDetail() { detailOpen = false; detailEmployee = null; invitationError = ''; }
	function showInvitation(payload: InvitationPayload, email: string) {
		const url = new URL(payload.invitationUrl, window.location.origin);
		if (url.origin !== window.location.origin || url.pathname !== '/account-setup') throw new Error('Invalid invitation URL.');
		invitation = { url: url.href, email, expiresAt: payload.invitationExpiresAt };
		copyMessage = '';
		invitationWarningDismissed = false;
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
				invitationError = response.status === 429 ? 'invitationRateLimited' : 'invitationFailed';
				return;
			}
			showInvitation(await apiData<InvitationPayload>(response), item.email);
		} catch { invitationError = 'invitationFailed'; }
		finally { issuingInvitation = false; }
	}
	async function copyInvitation() {
		if (!invitation) return;
		try { await navigator.clipboard.writeText(invitation.url); copyMessage = 'linkCopied'; }
		catch { copyMessage = 'linkCopyFailed'; }
	}
	async function remove(item: Employee) {
		if (!canManageEmployees || item.employmentStatus === 'deleted') return;
		if (!confirm(formatLocaleTemplate(text.deleteConfirm, fullName(item)))) return;
		const response = await fetch(`/v1/employees/${item.id}`, { method: 'DELETE' });
		if (!response.ok) { message = 'deleteFailed'; return; }
		message = 'removed'; await employeeList?.refresh();
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
				params.set('includeRetired', String(includeRetired));
				params.set('includeDeleted', String(includeDeleted));
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
			window.setTimeout(() => URL.revokeObjectURL(url), 0);
		} catch { message = 'exportFailed'; } finally { exporting = false; }
	}
	onMount(() => {
		void initialize();
	});
</script>

<svelte:window onkeydown={windowKeydown} />
{#snippet employeeCell(item: Employee)}<div class="employee-cell"><span class="avatar" aria-hidden="true">{monogram(item)}</span><div><div class="employee-name"><strong>{fullName(item)}</strong>{#if item.employmentStatus === 'retired'}<span class="employee-status retired">{text.retired}</span>{:else if item.employmentStatus === 'deleted'}<span class="employee-status deleted">{text.deleted}</span>{/if}</div><small>{item.employeeCode}</small></div></div>{/snippet}
{#snippet rolesCell(item: Employee)}<div class="role-badges">{#each item.roles as role}<span>{role.name}</span>{/each}</div>{/snippet}
{#snippet positionsCell(item: Employee)}<div class="position-badges">{#each item.positions as position}<span class:primary={position.isPrimary}>{position.name}</span>{/each}</div>{/snippet}
{#snippet departmentsCell(item: Employee)}<div class="position-badges">{#each item.departments as department}<span class:primary={department.isPrimary}>{department.name}</span>{/each}</div>{/snippet}
{#snippet pageActions()}<AddButton label={text.add} disabled={!canManageEmployees} onclick={create} />{/snippet}
{#snippet branchFilter()}<div class="employee-branch-filter"><span>{text.branchFilter}</span>{#if branchOptions.length === 1}<SearchSelect label={text.branchFilter} field="employeeBranchFilter" value={String(branchOptions[0].id)} options={[{ value: String(branchOptions[0].id), label: branchOptions[0].name }]} searchable={false} onSelect={() => undefined} />{:else}<SearchMultiSelect label={text.branchFilter} field="employeeBranchFilter" values={branchSelection} options={[{ value: allBranchesValue, label: text.allBranches }, ...branchOptions.map((branch) => ({ value: String(branch.id), label: branch.name }))]} onChange={chooseBranches} />{/if}</div>{/snippet}
{#snippet exportAction()}<div class="employee-list-actions"><div class="employee-visibility" aria-label={text.visibility}><label><input type="checkbox" bind:checked={includeRetired} /><span>{text.showRetired}</span></label><label><input type="checkbox" bind:checked={includeDeleted} /><span>{text.showDeleted}</span></label></div><button class="export-button" type="button" disabled={exporting || !canManageEmployees} onclick={() => void exportCsv()}>{exporting ? commonText.exporting : commonText.exportCsv}</button></div>{/snippet}
{#snippet invitationAction()}<div class="invite-footer">{#if invitationError}<StatusNotice message={text[invitationError]} tone="error" onDismiss={() => invitationError = ''} />{/if}<button class="app-primary-action" type="button" disabled={issuingInvitation} onclick={() => void issueInvitation(detailEmployee!)}>{issuingInvitation ? text.generating : text.generateInvitation}</button></div>{/snippet}

<AssetManagementShell title={text.title} active="Employees">
	<div class="employees-page">
	<MasterPageHeader title={text.title} actions={pageActions} />
	{#if message}<StatusNotice message={text[message]} tone={message === 'created' || message === 'updated' || message === 'removed' ? 'success' : 'error'} onDismiss={() => message = ''} />{/if}
		{#if branchFilterError}<StatusNotice message={text.branchFilterLoadFailed} tone="error" onDismiss={() => branchFilterError = false} /><button type="button" class="branch-retry" onclick={() => void initialize()}>{text.retryBranchFilter}</button>{/if}
		{#if branchFilterReady}<MasterList bind:this={employeeList} endpoint="/v1/employees" queryParams={employeeQueryParams} title={text.title} listHeading={text.title} description={commonText.description} initialSortBy="employee" pageSizeStorageKey="employees-page-size" minTableWidth={1120} edgePagination canManage={canManageEmployees} canDetail={true} canEdit={(item) => (item as Employee).employmentStatus !== 'deleted' && (canManageEmployees || item.id === currentUserId)} canDelete={(item) => canManageEmployees && (item as Employee).employmentStatus !== 'deleted'} actionLabel={(item) => fullName(item as Employee)} headerActions={exportAction} toolbarFilters={branchFilter} loadingLabel={text.loading} emptyLabel={commonText.noMatches} columns={[
		{ key: 'employee', label: text.employee, width: 18, cell: employeeCell, searchKeys: ['name', 'employeeCode', 'employmentStatus'] },
		{ key: 'age', label: text.age, width: 6, value: (item) => (item as Employee).age, searchKeys: ['age'] },
		{ key: 'lengthOfService', label: text.lengthOfService, width: 12, value: (item) => formatLengthOfService((item as Employee).lengthOfService, $localization), searchKeys: ['lengthOfService'] },
		{ key: 'department', label: text.departments, width: 12, cell: departmentsCell, searchKeys: ['department'] },
		{ key: 'group', label: text.groupId, width: 9, value: (item) => (item as Employee).group?.name, searchKeys: ['group'] },
		{ key: 'position', label: text.positions, width: 12, cell: positionsCell, searchKeys: ['position'] },
		{ key: 'employmentType', label: text.employmentTypeId, width: 11, value: (item) => (item as Employee).employmentType?.name, searchKeys: ['employmentType'] },
		{ key: 'branch', label: text.branchId, width: 9, value: (item) => (item as Employee).branch?.name },
		{ key: 'roles', label: text.roles, width: 11, cell: rolesCell, searchKeys: ['roles'] }
		]} onDetail={(item, trigger) => showDetail(item as Employee, trigger)} onEdit={(item, trigger) => edit(item as Employee, trigger)} onDelete={(item) => remove(item as Employee)} />{:else if !branchFilterError}<div class="page-state">{text.loading}</div>{/if}
	</div>

	{#if formOpen}<EmployeeFormModal mode={formMode} employee={editing} {masters} {roles} {canManageSystemSettings} {canAssignEmployeeRoles} returnFocus={formReturnFocus} onClose={() => formOpen = false} onSaved={formSaved} />{/if}

	{#if detailOpen && detailEmployee}<EmployeeDetailModal employee={detailEmployee} returnFocus={detailReturnFocus} footer={canInviteEmployees && (canManageSystemSettings || detailEmployee.roles.some((role) => role.isGeneralUser)) && detailEmployee.canIssueInvitation ? invitationAction : undefined} onClose={closeDetail} />{/if}
	{#if invitation}<ModalBackdrop><dialog bind:this={invitationDialogElement} class="employee-dialog invitation-dialog app-modal app-modal--invitation" open aria-modal="true" aria-labelledby="invitation-title"><header><h2 id="invitation-title">{text.invitationTitle}</h2><button class="modal-close app-modal-close" type="button" aria-label={text.closeInvitation} onclick={closeInvitation}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg></button></header><div class="invitation-body"><p>{formatLocaleTemplate(text.invitationDescription, formatTimestamp(invitation.expiresAt, $localization))}</p><EmailAddressActions email={invitation.email} subject={invitationEmailSubject($localization)} /><label>{text.invitationUrl}<input aria-label={text.invitationUrl} readonly value={invitation.url} onclick={(event) => event.currentTarget.select()} /></label>{#if !invitationWarningDismissed}<StatusNotice message={text.invitationWarning} tone="warning" onDismiss={() => invitationWarningDismissed = true} />{/if}{#if copyMessage}<StatusNotice message={text[copyMessage]} tone={copyMessage === 'linkCopyFailed' ? 'error' : 'success'} onDismiss={() => copyMessage = ''} />{/if}</div><footer class="employee-form-footer app-modal-footer"><button class="secondary" type="button" onclick={closeInvitation}>{commonText.close}</button><button class="app-primary-action" type="button" onclick={() => void copyInvitation()}>{text.copyLink}</button></footer></dialog></ModalBackdrop>{/if}
</AssetManagementShell>

<style>
	.employee-cell>div{min-width:0}
	.employee-branch-filter{display:flex;min-width:0;align-items:center;gap:8px;color:var(--text-secondary);font-size:var(--font-size-support);white-space:nowrap}.employee-branch-filter :global(.form-multi-select-field){width:220px}.employee-branch-filter :global(.form-multi-select-field>span){position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap}.employee-branch-filter :global(.form-multi-select-trigger){height:32px}.branch-retry{align-self:flex-start;border:1px solid var(--border);border-radius:4px;background:var(--surface);color:var(--text);padding:7px 12px}
	.employee-name{display:flex;min-width:0;align-items:center;gap:6px}.employee-status{display:inline-flex;flex:none;align-items:center;min-height:18px;padding:1px 6px;border:1px solid;border-radius:999px;font-size:var(--font-size-support);font-weight:700;line-height:1.2;text-transform:uppercase}.employee-status.retired{background:rgba(243,156,18,.12);color:#c87f0a;border-color:rgba(243,156,18,.3)}.employee-status.deleted{background:rgba(231,76,60,.12);color:#d13b2d;border-color:rgba(231,76,60,.3)}
	.role-badges{display:flex;flex-wrap:wrap;gap:4px}.role-badges>span{display:inline-flex;align-items:center;min-height:20px;padding:2px 7px;background:rgba(26,187,156,.12);color:#169f85;border:1px solid rgba(26,187,156,.28);border-radius:999px;font-size:var(--font-size-support);font-weight:600;line-height:1.2}
	.position-badges{display:flex;flex-wrap:wrap;gap:4px}.position-badges>span{display:inline-flex;align-items:center;min-height:20px;padding:2px 7px;background:var(--surface-secondary);color:var(--text-secondary);border:1px solid var(--border);border-radius:999px;font-size:var(--font-size-support);font-weight:500;line-height:1.2}.position-badges>span.primary{background:rgba(51,122,183,.12);color:#337ab7;border-color:rgba(51,122,183,.28)}
	.employees-page{display:flex;height:calc(100dvh - 124px);min-height:0;flex-direction:column}.employee-list-actions{display:flex;align-items:center;justify-content:flex-end;gap:14px}.employee-visibility{display:flex;flex-wrap:wrap;align-items:center;justify-content:flex-end;gap:6px 12px}.employee-visibility label{display:inline-flex;align-items:center;gap:6px;color:var(--text-secondary);font-size:var(--font-size-support);white-space:nowrap;cursor:pointer}.employee-visibility input{width:14px;height:14px;margin:0;accent-color:#1abb9c}.employee-visibility input:focus-visible{outline:2px solid #1abb9c;outline-offset:2px}.export-button{display:inline-flex;align-items:center;justify-content:center;height:32px;padding:0 12px;background:var(--surface)!important;color:var(--text-secondary)!important;border:1px solid var(--border);border-radius:4px;box-shadow:var(--shadow);font-size:var(--font-size-body);font-weight:500;line-height:1;transition:background 120ms,border-color 120ms,color 120ms,box-shadow 120ms;white-space:nowrap}.export-button:hover{background:var(--surface-secondary)!important;color:var(--text)!important}.export-button:disabled{cursor:wait;opacity:.6}.export-button:focus{outline:none}.export-button:focus-visible{outline:2px solid #1abb9c;outline-offset:2px}.employee-cell{display:flex;align-items:center;gap:8px}.avatar{display:grid;flex:0 0 24px;height:24px;place-items:center;background:#1abb9c;color:#fff;border-radius:50%;font-size:var(--font-size-support);font-weight:600}.employee-cell strong{display:block;min-width:0;overflow:hidden;color:var(--text);font-weight:500;text-overflow:ellipsis;white-space:nowrap}.employee-cell small{display:block;color:var(--muted);font-size:var(--font-size-support)}@media(max-width:900px){.employee-list-actions{align-items:stretch;flex-direction:column;gap:8px}.employee-visibility{justify-content:flex-start}}@media(max-width:700px){.employee-list-actions,.export-button{width:100%}.employee-visibility{align-items:flex-start;flex-direction:column}}
	/* Keep the actions visible while the fields scroll. */
	.invitation-body{display:grid;gap:14px;padding:24px;overflow-y:auto;font-size:var(--font-size-body)}.invitation-body p{margin:0;color:var(--text-secondary)}.invitation-body label{display:grid;gap:6px;font-weight:600}.invitation-body input{width:100%;min-width:0;padding:9px;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--text);font-size:var(--font-size-body)}.invite-footer{display:flex;align-items:center;justify-content:flex-end;gap:12px;width:100%}.invite-footer span{color:var(--danger);font-size:var(--font-size-support)}
	.export-button:disabled{cursor:not-allowed;opacity:.5}
	@media(max-width:700px){.employee-branch-filter,.employee-branch-filter :global(.form-multi-select-field){width:100%}}
</style>
